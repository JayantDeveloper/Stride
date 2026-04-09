const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");
const gcal = require("./googleCalendar");

const MISSED_BLOCK_GRACE_MINUTES = 10;
const RECOVERY_DISMISS_MINUTES = 60;
const DAY_END_HOUR = 23;
const BLOCK_STATES = new Set(["scheduled", "missed", "recovered", "deferred", "done"]);

function pad(n) {
  return String(n).padStart(2, "0");
}

function localDateKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localISO(input) {
  const d = input instanceof Date ? input : new Date(input);
  return `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function getLocalDayRange(input = new Date()) {
  const start = new Date(input);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function roundUpToHalfHour(input) {
  const d = new Date(input);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const next = Math.ceil(mins / 30) * 30;
  if (next >= 60) {
    d.setMinutes(0);
    d.setHours(d.getHours() + 1);
  } else {
    d.setMinutes(next);
  }
  return d;
}

function durationMinutes(startISO, endISO) {
  return Math.max(0, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000));
}

async function isTaskExecutedDuringBlock(userId, block) {
  if (!block.task_id) return false;

  const sessions = await dbAll(`
    SELECT * FROM focus_sessions
    WHERE task_id = ?
      AND user_id = ?
    ORDER BY started_at DESC
    LIMIT 50
  `, [block.task_id, userId]);

  const blockStart = new Date(block.start_time).getTime();
  const blockEnd = new Date(block.end_time).getTime();

  return sessions.some((session) => {
    const sessionStart = new Date(session.started_at).getTime();
    const planned = Math.max(1, session.actual_mins ?? session.planned_mins ?? 0);
    const sessionEnd = session.ended_at
      ? new Date(session.ended_at).getTime()
      : sessionStart + planned * 60_000;

    const startedInsideWindow = sessionStart >= blockStart && sessionStart <= blockEnd;
    const overlapsWindow = sessionStart < blockEnd && sessionEnd > blockStart;
    return startedInsideWindow || overlapsWindow;
  });
}

async function eligibleMissedBlocks(userId, now = new Date()) {
  const cutoff = new Date(now.getTime() - MISSED_BLOCK_GRACE_MINUTES * 60_000).toISOString();
  return dbAll(`
    SELECT
      ce.*,
      t.title AS task_title,
      t.description AS task_description,
      t.status AS task_status,
      t.priority AS task_priority,
      t.difficulty AS task_difficulty,
      t.estimated_mins AS task_estimated_mins,
      t.next_step AS task_next_step,
      t.breakdown_json AS task_breakdown_json,
      t.current_sprint_goal AS task_current_sprint_goal
    FROM calendar_events ce
    JOIN tasks t ON t.id = ce.task_id
    WHERE ce.user_id = ?
      AND t.user_id = ?
      AND ce.event_type = 'task_block'
      AND ce.task_id IS NOT NULL
      AND ce.block_state = 'scheduled'
      AND ce.end_time < ?
      AND t.status != 'Done'
    ORDER BY ce.end_time DESC
  `, [userId, userId, cutoff]);
}

async function materializeMissedBlocks(userId, now = new Date()) {
  const candidates = await eligibleMissedBlocks(userId, now);
  for (const block of candidates) {
    if (!(await isTaskExecutedDuringBlock(userId, block))) {
      await dbRun(`
        UPDATE calendar_events
        SET block_state = 'missed', synced_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `, [block.id, userId]);
    }
  }
}

async function getTaskBlockById(userId, blockId) {
  return dbGet(`
    SELECT
      ce.*,
      t.title AS task_title,
      t.description AS task_description,
      t.status AS task_status,
      t.priority AS task_priority,
      t.difficulty AS task_difficulty,
      t.estimated_mins AS task_estimated_mins,
      t.next_step AS task_next_step,
      t.breakdown_json AS task_breakdown_json,
      t.current_sprint_goal AS task_current_sprint_goal
    FROM calendar_events ce
    LEFT JOIN tasks t ON t.id = ce.task_id
    WHERE ce.id = ?
      AND ce.user_id = ?
  `, [blockId, userId]);
}

async function findFirstSlot({ userId, from, durationMins, excludeEventId = null }) {
  const start = roundUpToHalfHour(from);
  const dateStr = localDateKey(start);
  const dayEnd = new Date(`${dateStr}T${pad(DAY_END_HOUR)}:00:00`);
  let cursor = new Date(start);

  if (cursor >= dayEnd) return null;

  const params = [dayEnd.toISOString(), cursor.toISOString()];
  let sql = `
    SELECT * FROM calendar_events
    WHERE user_id = ?
      AND start_time < ?
      AND end_time > ?
  `;
  params.unshift(userId);

  if (excludeEventId) {
    sql += " AND id != ?";
    params.push(excludeEventId);
  }

  sql += " ORDER BY start_time ASC";

  const events = await dbAll(sql, params);

  for (const event of events) {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);

    if (eventEnd <= cursor) continue;

    const gapMins = Math.round((eventStart.getTime() - cursor.getTime()) / 60000);
    if (gapMins >= durationMins) {
      return {
        start: localISO(cursor),
        end: localISO(new Date(cursor.getTime() + durationMins * 60_000)),
      };
    }

    if (eventEnd > cursor) {
      cursor = roundUpToHalfHour(eventEnd);
      if (cursor >= dayEnd) return null;
    }
  }

  const remainingMins = Math.round((dayEnd.getTime() - cursor.getTime()) / 60000);
  if (remainingMins >= durationMins) {
    return {
      start: localISO(cursor),
      end: localISO(new Date(cursor.getTime() + durationMins * 60_000)),
    };
  }

  return null;
}

async function computeRecoveryOptions(userId, block, now = new Date()) {
  const dur = durationMinutes(block.start_time, block.end_time) || Math.max(10, block.task_estimated_mins ?? 30);

  const nextToday = await findFirstSlot({ userId, from: now, durationMins: dur, excludeEventId: block.id });

  return {
    duration_mins: dur,
    start_sprint: { planned_mins: 10 },
    move_next_open_slot: nextToday ? { start_time: nextToday.start, end_time: nextToday.end } : null,
  };
}

async function getEndOfDayRolloverStatus(userId, now = new Date()) {
  const { start, end } = getLocalDayRange(now);
  const dayStart = localISO(start);
  const nextDayStart = localISO(end);
  const rows = await dbAll(`
    SELECT ce.id, ce.task_id
    FROM calendar_events ce
    JOIN tasks t ON t.id = ce.task_id
    WHERE ce.user_id = ?
      AND t.user_id = ?
      AND ce.event_type = 'task_block'
      AND ce.task_id IS NOT NULL
      AND t.status != 'Done'
      AND ce.start_time >= ?
      AND ce.start_time < ?
      AND ce.block_state IN ('scheduled', 'missed')
  `, [userId, userId, dayStart, nextDayStart]);

  if (rows.length === 0) return null;

  const taskIds = new Set(rows.map((row) => row.task_id).filter(Boolean));
  return {
    today_block_count: rows.length,
    affected_task_count: taskIds.size,
    tomorrow_date: localDateKey(end),
  };
}

async function latestUnresolvedMissedBlock(userId, now = new Date()) {
  await materializeMissedBlocks(userId, now);
  const rows = await dbAll(`
    SELECT
      ce.*,
      t.title AS task_title,
      t.description AS task_description,
      t.status AS task_status,
      t.priority AS task_priority,
      t.difficulty AS task_difficulty,
      t.estimated_mins AS task_estimated_mins,
      t.next_step AS task_next_step,
      t.breakdown_json AS task_breakdown_json,
      t.current_sprint_goal AS task_current_sprint_goal
    FROM calendar_events ce
    JOIN tasks t ON t.id = ce.task_id
    WHERE ce.user_id = ?
      AND t.user_id = ?
      AND ce.event_type = 'task_block'
      AND ce.task_id IS NOT NULL
      AND ce.block_state = 'missed'
      AND t.status != 'Done'
      AND (
        ce.recovery_dismissed_until IS NULL
        OR ce.recovery_dismissed_until <= ?
      )
    ORDER BY ce.end_time DESC
    LIMIT 10
  `, [userId, userId, now.toISOString()]);

  for (const block of rows) {
    if (!(await isTaskExecutedDuringBlock(userId, block))) {
      return {
        ...block,
        recovery_options: await computeRecoveryOptions(userId, block, now),
      };
    }

    await dbRun(`
      UPDATE calendar_events
      SET block_state = 'recovered', recovery_dismissed_until = NULL, synced_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `, [block.id, userId]);
  }

  return null;
}

async function dismissMissedBlock(userId, blockId, now = new Date()) {
  const hiddenUntil = new Date(now.getTime() + RECOVERY_DISMISS_MINUTES * 60_000).toISOString();
  await dbRun(`
    UPDATE calendar_events
    SET recovery_dismissed_until = ?, synced_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `, [hiddenUntil, blockId, userId]);

  return hiddenUntil;
}

async function updateGoogleEventIfNeeded(userId, block, fields) {
  if (!block.google_event_id) return;
  await gcal.updateEvent(userId, block.google_event_id, {
    title: fields.title,
    description: fields.description,
    location: fields.location,
    startTime: fields.start_time,
    endTime: fields.end_time,
    colorId: fields.color_id,
  });
}

async function archiveHandledBlock(block, nextState) {
  if (!BLOCK_STATES.has(nextState)) {
    throw new Error(`Unsupported block_state: ${nextState}`);
  }

  await dbRun(`
    INSERT INTO calendar_events
      (id, user_id, google_event_id, google_cal_id, title, description, location, start_time, end_time, all_day, event_type, task_id, block_state, recovery_dismissed_until, color, color_id, synced_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP)
  `, [
    crypto.randomUUID(),
    block.user_id,
    block.google_cal_id ?? "primary",
    block.title,
    block.description ?? "",
    block.location ?? "",
    block.start_time,
    block.end_time,
    block.all_day ?? 0,
    block.event_type ?? "task_block",
    block.task_id ?? null,
    nextState,
    block.color ?? "blue",
    block.color_id ?? "",
  ]);
}

async function archiveTodayTaskBlocksForTomorrow(userId, now = new Date()) {
  const { start, end } = getLocalDayRange(now);
  const dayStart = localISO(start);
  const nextDayStart = localISO(end);
  const blocks = await dbAll(`
    SELECT ce.*, t.status AS task_status
    FROM calendar_events ce
    JOIN tasks t ON t.id = ce.task_id
    WHERE ce.user_id = ?
      AND t.user_id = ?
      AND ce.event_type = 'task_block'
      AND ce.task_id IS NOT NULL
      AND t.status != 'Done'
      AND ce.start_time >= ?
      AND ce.start_time < ?
      AND ce.block_state IN ('scheduled', 'missed')
    ORDER BY ce.start_time ASC
  `, [userId, userId, dayStart, nextDayStart]);

  const taskIds = new Set();

  for (const block of blocks) {
    taskIds.add(block.task_id);
    await archiveHandledBlock(block, "deferred");

    if (block.google_event_id) {
      try {
        await gcal.deleteEvent(userId, block.google_event_id);
      } catch (_) {
        // Keep the local rollover moving even if Google cleanup fails.
      }
    }

    await dbRun("DELETE FROM calendar_events WHERE id = ? AND user_id = ?", [block.id, userId]);
    await dbRun(
      "UPDATE tasks SET calendar_event_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE calendar_event_id = ? AND user_id = ?",
      [block.id, userId]
    );
  }

  return {
    deferred_blocks: blocks.length,
    affected_task_count: taskIds.size,
  };
}

async function rescheduleBlock(userId, blockId, mode) {
  const block = await getTaskBlockById(userId, blockId);
  if (!block) throw new Error("Missed block not found");
  if (!block.task_id) throw new Error("Missed block is not linked to a task");
  if (mode !== "move_next_open_slot") {
    throw new Error("Unsupported recovery mode");
  }

  const options = await computeRecoveryOptions(userId, block, new Date());
  const slot = options.move_next_open_slot;

  if (!slot) {
    throw new Error("No open slot available later today");
  }

  const handledState = "recovered";
  await archiveHandledBlock(block, handledState);
  await updateGoogleEventIfNeeded(userId, block, {
    title: block.title,
    description: block.description,
    location: block.location,
    start_time: slot.start_time,
    end_time: slot.end_time,
    color_id: block.color_id,
  });

  await dbRun(`
    UPDATE calendar_events
      SET start_time = ?,
        end_time = ?,
        block_state = 'scheduled',
        recovery_dismissed_until = NULL,
        synced_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `, [slot.start_time, slot.end_time, block.id, userId]);

  const updated = await getTaskBlockById(userId, block.id);
  return {
    block: updated,
    archived_state: handledState,
    recovery_options: await computeRecoveryOptions(userId, updated, new Date()),
  };
}

async function startRecoverySprint(userId, blockId) {
  const block = await getTaskBlockById(userId, blockId);
  if (!block) throw new Error("Missed block not found");
  if (!block.task_id) throw new Error("Missed block is not linked to a task");

  await dbRun(`
    UPDATE tasks
    SET status = 'Not Started', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'In Progress' AND id != ?
  `, [userId, block.task_id]);

  await dbRun(`
    UPDATE tasks
    SET status = 'In Progress', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `, [block.task_id, userId]);

  await dbRun(`
    UPDATE calendar_events
    SET block_state = 'recovered',
        recovery_dismissed_until = NULL,
        synced_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `, [block.id, userId]);

  const task = await dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [block.task_id, userId]);
  return { block: await getTaskBlockById(userId, block.id), task };
}

module.exports = {
  MISSED_BLOCK_GRACE_MINUTES,
  latestUnresolvedMissedBlock,
  getTaskBlockById,
  computeRecoveryOptions,
  getEndOfDayRolloverStatus,
  archiveTodayTaskBlocksForTomorrow,
  dismissMissedBlock,
  rescheduleBlock,
  startRecoverySprint,
};
