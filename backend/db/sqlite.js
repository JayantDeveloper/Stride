// SQLite adapter — mirrors the pg pool interface used by database.js
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_PATH = process.env.STRIDE_DB_PATH
  || path.join(os.homedir(), '.stride', 'stride.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db = null;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = OFF');
  }
  return _db;
}

function runQuery(db, sql, params) {
  const stmt = db.prepare(sql);
  if (/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|REPLACE)/i.test(sql)) {
    const info = stmt.run(...params);
    return { rows: [], rowCount: info.changes };
  }
  return { rows: stmt.all(...params) };
}

function getPool() {
  return {
    query: async (sql, params = []) => runQuery(getDb(), sql, params),
    connect: async () => {
      const db = getDb();
      return {
        query: async (sql, params = []) => {
          if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql.trim())) {
            db.prepare(sql).run();
            return { rows: [] };
          }
          return runQuery(db, sql, params);
        },
        release: () => {},
      };
    },
    end: async () => {
      if (_db) { _db.close(); _db = null; }
    },
  };
}

function getPgMemDb() { return null; }
async function closePool() { if (_db) { _db.close(); _db = null; } }

module.exports = { getPool, getPgMemDb, closePool, getDb, DB_PATH };
