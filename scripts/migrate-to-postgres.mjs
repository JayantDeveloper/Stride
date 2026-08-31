#!/usr/bin/env node
/**
 * Copy the local SQLite database into a Postgres instance.
 *
 *   node scripts/migrate-to-postgres.mjs 'postgresql://user:pass@host:5432/db'
 *   node scripts/migrate-to-postgres.mjs --dry-run 'postgres://...'
 *
 * How it works:
 *   1. Points the app's own schema builder at the target and lets it create the tables,
 *      so the destination schema is by definition the one the app expects — no second
 *      copy of the DDL to drift out of sync.
 *   2. Copies each table in foreign-key-safe order.
 *   3. Re-counts every table on both sides and fails loudly if any pair disagrees.
 *
 * Safe to re-run: every insert is ON CONFLICT DO NOTHING, so a partial run can be
 * resumed rather than restarted, and re-running on a finished database is a no-op.
 *
 * NOTHING IS DELETED. If the target already holds rows this only tops it up; it will
 * never truncate. Verify the count summary before pointing the app at the result.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(HERE, '..', 'backend');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const TARGET = args.find((a) => a.startsWith('postgres'));

if (!TARGET) {
  console.error('usage: node scripts/migrate-to-postgres.mjs [--dry-run] <postgres-url>');
  process.exit(1);
}

// Parents before children. calendar_events references tasks; everything user-scoped
// references "user", so the auth tables lead.
const TABLES = [
  'user', 'session', 'account', 'verification',
  'app_settings', 'user_settings',
  'tasks', 'calendar_events', 'deleted_google_events',
  'focus_sessions', 'accountability_checkins', 'daily_logs',
];

// SQLite has no boolean type and stores these as 0/1; the Postgres schema declares them
// BOOLEAN, and pg will not coerce an integer into one.
const BOOLEAN_COLUMNS = { user: ['emailVerified'] };

const SQLITE_PATH = process.env.STRIDE_DB_PATH
  || path.join(os.homedir(), '.stride', 'stride.db');

function coerce(table, column, value) {
  if (value === null || value === undefined) return null;
  if ((BOOLEAN_COLUMNS[table] || []).includes(column)) return Boolean(value);
  return value;
}

async function main() {
  const Database = require(path.join(BACKEND, 'node_modules', 'better-sqlite3'));
  const { Pool } = require(path.join(BACKEND, 'node_modules', 'pg'));

  const src = new Database(SQLITE_PATH, { readonly: true });
  console.log(`source  ${SQLITE_PATH}`);
  console.log(`target  ${TARGET.replace(/:[^:@/]+@/, ':****@')}`);
  console.log(DRY ? '\nDRY RUN — nothing will be written\n' : '');

  // Build the destination schema using the app's own initializer.
  if (!DRY) {
    process.env.DATABASE_URL = TARGET;
    delete process.env.LOCAL_MODE;
    const db = require(path.join(BACKEND, 'db', 'database.js'));
    await db.initializeSchema();
    console.log('schema  created via the app\'s own initializeSchema()\n');
  }

  const pool = new Pool({ connectionString: TARGET, ssl: { rejectUnauthorized: false } });
  const summary = [];

  for (const table of TABLES) {
    let rows;
    try {
      rows = src.prepare(`SELECT * FROM "${table}"`).all();
    } catch {
      summary.push({ table, src: '—', dst: '—', note: 'not present in SQLite' });
      continue;
    }
    if (!rows.length) {
      summary.push({ table, src: 0, dst: 0, note: 'empty' });
      continue;
    }

    const cols = Object.keys(rows[0]);
    const quoted = cols.map((c) => `"${c}"`).join(', ');
    const holders = cols.map((_, i) => `$${i + 1}`).join(', ');

    if (!DRY) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of rows) {
          const values = cols.map((c) => coerce(table, c, row[c]));
          await client.query(
            `INSERT INTO "${table}" (${quoted}) VALUES (${holders}) ON CONFLICT DO NOTHING`,
            values
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\nFAILED on "${table}": ${err.message}`);
        throw err;
      } finally {
        client.release();
      }
    }

    let dst = '—';
    if (!DRY) {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      dst = r.rows[0].n;
    }
    summary.push({ table, src: rows.length, dst, note: '' });
  }

  console.log('table                        sqlite   postgres');
  console.log('─'.repeat(50));
  let mismatched = 0;
  for (const s of summary) {
    const bad = !DRY && typeof s.src === 'number' && typeof s.dst === 'number' && s.dst < s.src;
    if (bad) mismatched += 1;
    console.log(
      `${s.table.padEnd(28)} ${String(s.src).padStart(6)}   ${String(s.dst).padStart(8)}` +
      (bad ? '   ← SHORT' : s.note ? `   ${s.note}` : '')
    );
  }

  await pool.end();
  src.close();

  if (mismatched) {
    console.error(`\n${mismatched} table(s) have fewer rows in Postgres than SQLite.`);
    process.exit(1);
  }
  console.log(DRY ? '\nDry run complete.' : '\nMigration complete — every table matches or exceeds the source.');
}

main().catch((err) => {
  console.error('\nMigration aborted:', err.message);
  process.exit(1);
});
