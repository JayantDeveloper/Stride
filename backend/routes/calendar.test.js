const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");

function localDateKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTimestamp(dateKey, hour, minute) {
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

test("POST /api/calendar/end-of-day-rollover archives today's unfinished task blocks and reschedules tomorrow", async (t) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  process.env.DATABASE_URL = `pg-mem://stride-calendar-${Date.now()}-${Math.random()}`;
  delete process.env.POSTGRES_URL;
  delete require.cache[require.resolve("../db/postgres")];
  delete require.cache[require.resolve("../db/database")];
  delete require.cache[require.resolve("../services/googleCalendar")];
  delete require.cache[require.resolve("./calendar")];

  const { initializeSchema, dbAll, dbGet, dbRun } = require("../db/database");
  const calendarRouter = require("./calendar");

  await initializeSchema();

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: "test-user-id" };
    next();
  });
  app.use("/api/calendar", calendarRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[require.resolve("../db/postgres")];
    delete require.cache[require.resolve("../db/database")];
    delete require.cache[require.resolve("../services/googleCalendar")];
    delete require.cache[require.resolve("./calendar")];
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  const now = new Date();
  const todayKey = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);

  const taskOneId = crypto.randomUUID();
  const taskTwoId = crypto.randomUUID();

  await dbRun(
    `
    INSERT INTO tasks (id, user_id, title, status, priority, difficulty, estimated_mins, allow_split, position)
    VALUES (?, ?, 'Write spec', 'Not Started', 'High', 'Easy', 30, 1, 0)
  `,
    [taskOneId, "test-user-id"],
  );
  await dbRun(
    `
    INSERT INTO tasks (id, user_id, title, status, priority, difficulty, estimated_mins, allow_split, position)
    VALUES (?, ?, 'Ship fix', 'In Progress', 'Medium', 'Easy', 30, 1, 1)
  `,
    [taskTwoId, "test-user-id"],
  );

  const missedBlockId = crypto.randomUUID();
  const scheduledBlockId = crypto.randomUUID();
  await dbRun(
    `
    INSERT INTO calendar_events
      (id, user_id, title, start_time, end_time, event_type, task_id, block_state, color, synced_at)
    VALUES (?, ?, 'Write spec', ?, ?, 'task_block', ?, 'missed', 'blue', CURRENT_TIMESTAMP)
  `,
    [
      missedBlockId,
      "test-user-id",
      localTimestamp(todayKey, 15, 0),
      localTimestamp(todayKey, 15, 30),
      taskOneId,
    ],
  );
  await dbRun(
    `
    INSERT INTO calendar_events
      (id, user_id, title, start_time, end_time, event_type, task_id, block_state, color, synced_at)
    VALUES (?, ?, 'Ship fix', ?, ?, 'task_block', ?, 'scheduled', 'blue', CURRENT_TIMESTAMP)
  `,
    [
      scheduledBlockId,
      "test-user-id",
      localTimestamp(todayKey, 22, 30),
      localTimestamp(todayKey, 23, 0),
      taskTwoId,
    ],
  );

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/calendar/end-of-day-rollover`,
    {
      method: "POST",
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.deferred_blocks, 2);
  assert.equal(body.affected_task_count, 2);
  assert.equal(body.tomorrow_date, tomorrowKey);
  assert.ok(body.scheduled.length >= 2);

  const archived = await dbGet(
    `
    SELECT COUNT(*) AS count
    FROM calendar_events
    WHERE user_id = ?
      AND block_state = 'deferred'
      AND date(start_time) = date(?)
  `,
    ["test-user-id", todayKey],
  );
  assert.equal(Number(archived.count), 2);

  const liveToday = await dbGet(
    `
    SELECT COUNT(*) AS count
    FROM calendar_events
    WHERE user_id = ?
      AND event_type = 'task_block'
      AND block_state IN ('scheduled', 'missed')
      AND date(start_time) = date(?)
  `,
    ["test-user-id", todayKey],
  );
  assert.equal(Number(liveToday.count), 0);

  const tomorrowBlocks = await dbAll(
    `
    SELECT task_id, block_state, start_time
    FROM calendar_events
    WHERE user_id = ?
      AND event_type = 'task_block'
      AND block_state = 'scheduled'
      AND date(start_time) = date(?)
    ORDER BY start_time ASC
  `,
    ["test-user-id", tomorrowKey],
  );

  assert.ok(tomorrowBlocks.length >= 2);
  assert.deepEqual(
    new Set(tomorrowBlocks.map((row) => row.task_id)),
    new Set([taskOneId, taskTwoId]),
  );
});
