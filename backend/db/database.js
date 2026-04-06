// database.js — Turso/libsql client with async helpers and schema initialization

const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

const isLocal = !process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL.startsWith("file:");

const url = process.env.TURSO_DATABASE_URL ||
  `file:${path.join(__dirname, "..", "data", "focusexec.db")}`;

if (isLocal) {
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ── Async helpers ─────────────────────────────────────────────────────────────

async function dbGet(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows[0] ?? null;
}

async function dbAll(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows;
}

async function dbRun(sql, params = []) {
  return client.execute({ sql, args: params });
}

async function dbBatch(stmts) {
  return client.batch(stmts, "write");
}

// ── Schema initialization ─────────────────────────────────────────────────────

async function initializeSchema() {
  if (isLocal) {
    await client.execute("PRAGMA journal_mode = WAL");
  }
  await client.execute("PRAGMA foreign_keys = ON");

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL DEFAULT '',
      description     TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'Not Started',
      priority        TEXT NOT NULL DEFAULT 'Medium',
      difficulty      TEXT NOT NULL DEFAULT 'Easy',
      estimated_mins  INTEGER DEFAULT 30,
      due_date        TEXT,
      scheduled_date  TEXT,
      tags            TEXT DEFAULT '[]',
      next_step       TEXT DEFAULT '',
      breakdown_json  TEXT DEFAULT '',
      current_subtask_index INTEGER NOT NULL DEFAULT 0,
      current_sprint_goal TEXT DEFAULT '',
      position        INTEGER NOT NULL DEFAULT 0,
      calendar_event_id TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id              TEXT PRIMARY KEY,
      google_event_id TEXT UNIQUE,
      google_cal_id   TEXT NOT NULL DEFAULT 'primary',
      title           TEXT NOT NULL,
      description     TEXT DEFAULT '',
      location        TEXT DEFAULT '',
      start_time      TEXT NOT NULL,
      end_time        TEXT NOT NULL,
      all_day         INTEGER NOT NULL DEFAULT 0,
      event_type      TEXT NOT NULL DEFAULT 'external',
      task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      block_state     TEXT NOT NULL DEFAULT 'scheduled',
      recovery_dismissed_until TEXT,
      color           TEXT DEFAULT 'blue',
      color_id        TEXT DEFAULT '',
      synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id              TEXT PRIMARY KEY,
      task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      started_at      TEXT NOT NULL,
      ended_at        TEXT,
      planned_mins    INTEGER NOT NULL DEFAULT 25,
      actual_mins     INTEGER,
      session_type    TEXT NOT NULL DEFAULT 'focus',
      outcome         TEXT,
      notes           TEXT DEFAULT ''
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS accountability_checkins (
      id                  TEXT PRIMARY KEY,
      focus_session_id    TEXT REFERENCES focus_sessions(id) ON DELETE CASCADE,
      task_id             TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      prompted_at         TEXT NOT NULL DEFAULT (datetime('now')),
      outcome             TEXT,
      notes               TEXT DEFAULT '',
      ai_followup         TEXT DEFAULT '',
      completed_at        TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS google_credentials (
      id              INTEGER PRIMARY KEY DEFAULT 1,
      access_token    TEXT,
      refresh_token   TEXT,
      token_expiry    TEXT,
      email           TEXT,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      id              TEXT PRIMARY KEY,
      date            TEXT NOT NULL UNIQUE,
      morning_note    TEXT DEFAULT '',
      ai_plan         TEXT DEFAULT '',
      evening_note    TEXT DEFAULT '',
      ai_review       TEXT DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // ── Migrations ──────────────────────────────────────────────────────────────
  await ensureColumns("tasks", [
    ["scheduled_date", "TEXT"],
    ["next_step", "TEXT DEFAULT ''"],
    ["breakdown_json", "TEXT DEFAULT ''"],
    ["current_subtask_index", "INTEGER NOT NULL DEFAULT 0"],
    ["current_sprint_goal", "TEXT DEFAULT ''"],
    ["allow_split", "INTEGER NOT NULL DEFAULT 0"],
  ]);

  await ensureColumns("calendar_events", [
    ["location", "TEXT DEFAULT ''"],
    ["all_day", "INTEGER NOT NULL DEFAULT 0"],
    ["task_id", "TEXT"],
    ["block_state", "TEXT NOT NULL DEFAULT 'scheduled'"],
    ["recovery_dismissed_until", "TEXT"],
    ["color_id", "TEXT DEFAULT ''"],
  ]);
}

async function ensureColumns(table, columns) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  const present = new Set(result.rows.map(r => r.name));
  for (const [name, definition] of columns) {
    if (!present.has(name)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

module.exports = { dbGet, dbAll, dbRun, dbBatch, initializeSchema };
