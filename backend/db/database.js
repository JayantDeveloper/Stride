const { getPool, getPgMemDb } = require("./postgres");

function normalizeSql(sql) {
  return sql
    .replace(/datetime\('now'\)/g, "CURRENT_TIMESTAMP")
    .replace(/datetime\("now"\)/g, "CURRENT_TIMESTAMP");
}

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function prepareQuery(sql) {
  return convertPlaceholders(normalizeSql(sql));
}

async function dbGet(sql, params = []) {
  const result = await getPool().query(prepareQuery(sql), params);
  return result.rows[0] ?? null;
}

async function dbAll(sql, params = []) {
  const result = await getPool().query(prepareQuery(sql), params);
  return result.rows;
}

async function dbRun(sql, params = []) {
  return getPool().query(prepareQuery(sql), params);
}

async function dbBatch(statements) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const results = [];
    for (const statement of statements) {
      const sql = typeof statement === "string" ? statement : statement.sql;
      const args = typeof statement === "string" ? [] : (statement.args ?? []);
      results.push(await client.query(prepareQuery(sql), args));
    }
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeSchema() {
  await initializeAuthSchema();
  const userReference = getPgMemDb()
    ? ""
    : ' REFERENCES "user"(id) ON DELETE CASCADE';

  await dbRun(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT${userReference},
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Not Started',
      priority TEXT NOT NULL DEFAULT 'Medium',
      difficulty TEXT NOT NULL DEFAULT 'Easy',
      estimated_mins INTEGER DEFAULT 30,
      due_date TEXT,
      scheduled_date TEXT,
      tags TEXT DEFAULT '[]',
      next_step TEXT DEFAULT '',
      breakdown_json TEXT DEFAULT '',
      current_subtask_index INTEGER NOT NULL DEFAULT 0,
      current_sprint_goal TEXT DEFAULT '',
      allow_split INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      calendar_event_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT${userReference},
      google_event_id TEXT,
      google_cal_id TEXT NOT NULL DEFAULT 'primary',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      location TEXT DEFAULT '',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      event_type TEXT NOT NULL DEFAULT 'external',
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      block_state TEXT NOT NULL DEFAULT 'scheduled',
      color TEXT DEFAULT 'blue',
      color_id TEXT DEFAULT '',
      synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT${userReference},
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      planned_mins INTEGER NOT NULL DEFAULT 25,
      actual_mins INTEGER,
      session_type TEXT NOT NULL DEFAULT 'focus',
      outcome TEXT,
      notes TEXT DEFAULT ''
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS accountability_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT${userReference},
      focus_session_id TEXT REFERENCES focus_sessions(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      prompted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      outcome TEXT,
      notes TEXT DEFAULT '',
      ai_followup TEXT DEFAULT '',
      completed_at TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT${userReference},
      date TEXT NOT NULL,
      morning_note TEXT DEFAULT '',
      ai_plan TEXT DEFAULT '',
      evening_note TEXT DEFAULT '',
      ai_review TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL${userReference},
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `);

  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_user_google_event
      ON calendar_events(user_id, google_cal_id, google_event_id)
  `);
  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_logs_user_date
      ON daily_logs(user_id, date)
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_tasks_user_position
      ON tasks(user_id, position, created_at)
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start
      ON calendar_events(user_id, start_time)
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_started
      ON focus_sessions(user_id, started_at)
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_checkins_user_prompted
      ON accountability_checkins(user_id, prompted_at)
  `);
}

async function initializeAuthSchema() {
  if (getPgMemDb()) {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" TEXT,
        "name" TEXT,
        "email" TEXT,
        "emailVerified" BOOLEAN,
        "image" TEXT,
        "createdAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ
      )
    `);

    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_id
        ON "user"("id")
    `);
    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email
        ON "user"("email")
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS "session" (
        "id" TEXT,
        "expiresAt" TIMESTAMPTZ,
        "token" TEXT,
        "createdAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "userId" TEXT
      )
    `);

    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_session_id
        ON "session"("id")
    `);
    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token
        ON "session"("token")
    `);
    await dbRun(`
      CREATE INDEX IF NOT EXISTS idx_session_user
        ON "session"("userId")
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS "account" (
        "id" TEXT,
        "accountId" TEXT,
        "providerId" TEXT,
        "userId" TEXT,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "accessTokenExpiresAt" TIMESTAMPTZ,
        "refreshTokenExpiresAt" TIMESTAMPTZ,
        "scope" TEXT,
        "password" TEXT,
        "createdAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ
      )
    `);

    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_account_id
        ON "account"("id")
    `);
    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_account_provider_account
        ON "account"("providerId", "accountId")
    `);
    await dbRun(`
      CREATE INDEX IF NOT EXISTS idx_account_user
        ON "account"("userId")
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS "verification" (
        "id" TEXT,
        "identifier" TEXT,
        "value" TEXT,
        "expiresAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ
      )
    `);

    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_id
        ON "verification"("id")
    `);
    await dbRun(`
      CREATE INDEX IF NOT EXISTS idx_verification_identifier
        ON "verification"("identifier")
    `);
    return;
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
      "image" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email
      ON "user"("email")
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS "session" (
      "id" TEXT PRIMARY KEY,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "token" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token
      ON "session"("token")
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_session_user
      ON "session"("userId")
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS "account" (
      "id" TEXT PRIMARY KEY,
      "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "idToken" TEXT,
      "accessTokenExpiresAt" TIMESTAMPTZ,
      "refreshTokenExpiresAt" TIMESTAMPTZ,
      "scope" TEXT,
      "password" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_provider_account
      ON "account"("providerId", "accountId")
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_account_user
      ON "account"("userId")
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS "verification" (
      "id" TEXT PRIMARY KEY,
      "identifier" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_verification_identifier
      ON "verification"("identifier")
  `);
}

async function claimLegacyDataForUser(userId) {
  const owner = await dbGet(
    "SELECT value FROM app_settings WHERE key = 'legacy_owner_user_id'",
  );

  if (owner?.value && owner.value !== userId) {
    return;
  }

  const [tasksRow, eventsRow, sessionsRow, checkinsRow, logsRow, pomodoroRow] =
    await Promise.all([
      dbGet("SELECT COUNT(*)::int AS count FROM tasks WHERE user_id IS NULL"),
      dbGet(
        "SELECT COUNT(*)::int AS count FROM calendar_events WHERE user_id IS NULL",
      ),
      dbGet(
        "SELECT COUNT(*)::int AS count FROM focus_sessions WHERE user_id IS NULL",
      ),
      dbGet(
        "SELECT COUNT(*)::int AS count FROM accountability_checkins WHERE user_id IS NULL",
      ),
      dbGet(
        "SELECT COUNT(*)::int AS count FROM daily_logs WHERE user_id IS NULL",
      ),
      dbGet("SELECT value FROM app_settings WHERE key = 'pomodoro_state'"),
    ]);

  const hasLegacyRows =
    Number(tasksRow?.count ?? 0) > 0 ||
    Number(eventsRow?.count ?? 0) > 0 ||
    Number(sessionsRow?.count ?? 0) > 0 ||
    Number(checkinsRow?.count ?? 0) > 0 ||
    Number(logsRow?.count ?? 0) > 0 ||
    Boolean(pomodoroRow?.value);

  if (!hasLegacyRows) return;

  await dbRun("UPDATE tasks SET user_id = ? WHERE user_id IS NULL", [userId]);
  await dbRun("UPDATE calendar_events SET user_id = ? WHERE user_id IS NULL", [
    userId,
  ]);
  await dbRun("UPDATE focus_sessions SET user_id = ? WHERE user_id IS NULL", [
    userId,
  ]);
  await dbRun(
    "UPDATE accountability_checkins SET user_id = ? WHERE user_id IS NULL",
    [userId],
  );
  await dbRun("UPDATE daily_logs SET user_id = ? WHERE user_id IS NULL", [
    userId,
  ]);

  if (pomodoroRow?.value) {
    await dbRun(
      `
      INSERT INTO user_settings (user_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT (user_id, key) DO NOTHING
    `,
      [userId, "pomodoro_state", pomodoroRow.value],
    );
  }

  await dbRun(
    `
    INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `,
    ["legacy_owner_user_id", userId],
  );
}

module.exports = {
  dbGet,
  dbAll,
  dbRun,
  dbBatch,
  initializeAuthSchema,
  initializeSchema,
  claimLegacyDataForUser,
};
