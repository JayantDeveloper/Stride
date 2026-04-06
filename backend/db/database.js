// database.js — opens SQLite, runs CREATE TABLE IF NOT EXISTS for all tables,
// migrates old tasks.json if it exists, and exports the db singleton.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const dataDir = process.env.NODE_ENV === "production"
  ? "/data"
  : path.join(__dirname, "..", "data");
const DB_PATH = path.join(dataDir, "focusexec.db");

// Ensure the data directory exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
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
  );

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
  );

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
  );

  CREATE TABLE IF NOT EXISTS accountability_checkins (
    id                  TEXT PRIMARY KEY,
    focus_session_id    TEXT REFERENCES focus_sessions(id) ON DELETE CASCADE,
    task_id             TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    prompted_at         TEXT NOT NULL DEFAULT (datetime('now')),
    outcome             TEXT,
    notes               TEXT DEFAULT '',
    ai_followup         TEXT DEFAULT '',
    completed_at        TEXT
  );

  CREATE TABLE IF NOT EXISTS google_credentials (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    access_token    TEXT,
    refresh_token   TEXT,
    token_expiry    TEXT,
    email           TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    id              TEXT PRIMARY KEY,
    date            TEXT NOT NULL UNIQUE,
    morning_note    TEXT DEFAULT '',
    ai_plan         TEXT DEFAULT '',
    evening_note    TEXT DEFAULT '',
    ai_review       TEXT DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Lightweight schema migrations for existing local DBs ─────────────────────

function existingColumns(table) {
  return new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name)
  );
}

function ensureColumns(table, columns) {
  const present = existingColumns(table);
  for (const [name, definition] of columns) {
    if (!present.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

ensureColumns("tasks", [
  ["scheduled_date", "TEXT"],
  ["next_step", "TEXT DEFAULT ''"],
  ["breakdown_json", "TEXT DEFAULT ''"],
  ["current_subtask_index", "INTEGER NOT NULL DEFAULT 0"],
  ["current_sprint_goal", "TEXT DEFAULT ''"],
]);

ensureColumns("calendar_events", [
  ["location", "TEXT DEFAULT ''"],
  ["all_day", "INTEGER NOT NULL DEFAULT 0"],
  ["task_id", "TEXT"],
  ["block_state", "TEXT NOT NULL DEFAULT 'scheduled'"],
  ["recovery_dismissed_until", "TEXT"],
  ["color_id", "TEXT DEFAULT ''"],
]);

// ── Migrate old tasks.json ────────────────────────────────────────────────────

const oldTasksFile = path.join(dataDir, "tasks.json");
if (fs.existsSync(oldTasksFile)) {
  try {
    const { tasks = [] } = JSON.parse(fs.readFileSync(oldTasksFile, "utf8"));
    if (tasks.length > 0) {
      const insert = db.prepare(`
        INSERT OR IGNORE INTO tasks (id, title, status, difficulty, position, created_at, updated_at)
        VALUES (@id, @title, @status, @difficulty, @position, datetime('now'), datetime('now'))
      `);
      const migrate = db.transaction((rows) => {
        for (const t of rows) insert.run({
          id: String(t.id || crypto.randomUUID()),
          title: t.title || "",
          status: t.status || "Not Started",
          difficulty: t.difficulty || "Easy",
          position: t.position || 0,
        });
      });
      migrate(tasks);
      console.log(`Migrated ${tasks.length} task(s) from tasks.json`);
    }
    fs.renameSync(oldTasksFile, oldTasksFile + ".migrated");
  } catch (e) {
    console.error("Migration from tasks.json failed:", e.message);
  }
}

module.exports = db;
