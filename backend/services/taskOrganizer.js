const crypto = require("crypto");
const { dbAll, dbRun } = require("../db/database");
const gcal = require("./googleCalendar");
const {
  shiftDateKey,
  dateStr,
  localISO,
  parseCalendarDateTime,
  snapTo30,
  buildSchedulingWindows,
  toOccupiedIntervals,
  addOccupiedInterval,
  findSolidSlot,
  findNextSplitChunk,
} = require("./calendarOrganizer");

const PRIORITY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const SLEEP_HOUR = 23;
const OVERFLOW_HOUR = 8;
const TASK_BLOCK_COLORS = [
  "#6366F1",
  "#A855F7",
  "#F59E0B",
  "#EC4899",
  "#14B8A6",
  "#EF4444",
  "#F97316",
];
const GCAL_COLOR_HEX = {
  tomato: "#D50000",
  flamingo: "#E67C73",
  tangerine: "#F4511E",
  banana: "#F6BF26",
  sage: "#33B679",
  basil: "#0B8043",
  peacock: "#039BE5",
  blueberry: "#3F51B5",
  lavender: "#7986CB",
  grape: "#8E24AA",
  graphite: "#616161",
};

function pad(n) {
  return String(n).padStart(2, "0");
}

async function organizeTasks(userId, { date, start_from_now = false }) {
  const todayKey = dateStr(new Date());
  const targetDate = start_from_now ? todayKey : (date ?? todayKey);

  const allTasksRaw = await dbAll(
    "SELECT * FROM tasks WHERE user_id = ? AND status != 'Done' ORDER BY position ASC",
    [userId],
  );
  const allTasks = allTasksRaw.sort((a, b) => {
    const pd =
      (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    return pd !== 0 ? pd : (a.position ?? 0) - (b.position ?? 0);
  });

  if (allTasks.length === 0) {
    return { scheduled: [], unscheduled: [] };
  }

  const nextDateStr = shiftDateKey(targetDate, 1);

  const candidateEvents = await dbAll(
    `
    SELECT * FROM calendar_events
    WHERE user_id = ?
    AND date(start_time) <= ?
    AND date(end_time) >= ?
    ORDER BY start_time ASC
  `,
    [userId, nextDateStr, targetDate],
  );

  const usedHexes = new Set(
    candidateEvents
      .map((e) => {
        if (e.color?.startsWith("#")) return e.color;
        return GCAL_COLOR_HEX[e.color_id] ?? null;
      })
      .filter(Boolean),
  );
  const taskColor =
    TASK_BLOCK_COLORS.find((c) => !usedHexes.has(c)) ?? TASK_BLOCK_COLORS[0];

  const now = new Date();
  const nowMs = now.getTime();
  const oldBlocks = (
    await dbAll(
      `
    SELECT * FROM calendar_events
    WHERE user_id = ?
    AND event_type IN ('task_block', 'completed')
    AND date(start_time) <= ?
    AND date(end_time) >= ?
    ORDER BY start_time ASC
  `,
      [userId, nextDateStr, targetDate],
    )
  ).filter((ev) => {
    if (!start_from_now) return true;
    const eventStartMs = parseCalendarDateTime(ev.start_time)?.getTime();
    return !Number.isNaN(eventStartMs) && eventStartMs >= nowMs;
  });

  const deletedBlockIds = new Set();
  for (const ev of oldBlocks) {
    if (ev.google_event_id) {
      try {
        await gcal.deleteEvent(userId, ev.google_event_id);
      } catch (_) {}
    }
    await dbRun("DELETE FROM calendar_events WHERE id = ? AND user_id = ?", [
      ev.id,
      userId,
    ]);
    await dbRun(
      "UPDATE tasks SET calendar_event_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE calendar_event_id = ? AND user_id = ?",
      [ev.id, userId],
    );
    deletedBlockIds.add(ev.id);
  }

  let organizingStart;
  if (start_from_now) {
    organizingStart = snapTo30(new Date());
    if (dateStr(organizingStart) !== targetDate) {
      organizingStart = parseCalendarDateTime(
        `${nextDateStr}T${pad(OVERFLOW_HOUR)}:00:00`,
      );
    }
  } else if (targetDate === todayKey) {
    organizingStart = snapTo30(new Date());
    if (dateStr(organizingStart) !== targetDate) {
      organizingStart = parseCalendarDateTime(
        `${nextDateStr}T${pad(OVERFLOW_HOUR)}:00:00`,
      );
    }
  } else {
    organizingStart = parseCalendarDateTime(
      `${targetDate}T${pad(OVERFLOW_HOUR)}:00:00`,
    );
  }

  const windows = buildSchedulingWindows({
    date: targetDate,
    nextDate: nextDateStr,
    startAt: organizingStart,
    dayStartHour: OVERFLOW_HOUR,
    dayEndHour: SLEEP_HOUR,
  });

  if (windows.length === 0) {
    return { scheduled: [], unscheduled: allTasks.map((task) => task.id) };
  }

  const horizonStart = windows[0].start;
  const horizonEnd = windows[windows.length - 1].end;
  const occupiedIntervals = toOccupiedIntervals(
    candidateEvents.filter((event) => !deletedBlockIds.has(event.id)),
    horizonStart,
    horizonEnd,
  );

  const scheduled = [];
  const unscheduled = [];

  for (const task of allTasks) {
    let remaining = Math.max(1, task.estimated_mins ?? 30);
    const taskBlockIds = [];
    const taskSplit = !!task.allow_split;

    const persistScheduledBlock = async (slotStart, slotEnd) => {
      const startISO = localISO(slotStart);
      const endISO = localISO(slotEnd);

      const eventId = crypto.randomUUID();
      let googleEventId = null;
      try {
        const gEv = await gcal.createEvent(userId, {
          title: task.title,
          startTime: startISO,
          endTime: endISO,
        });
        googleEventId = gEv.id;
      } catch (e) {
        if (!/not connected|token unavailable/i.test(e.message)) {
          console.error("GCal create failed:", e.message);
        }
      }

      await dbRun(
        `
        INSERT INTO calendar_events
          (id, user_id, google_event_id, google_cal_id, title, description, start_time, end_time, event_type, task_id, block_state, color, synced_at)
        VALUES (?, ?, ?, 'primary', ?, '', ?, ?, 'task_block', ?, 'scheduled', ?, CURRENT_TIMESTAMP)
      `,
        [
          eventId,
          userId,
          googleEventId,
          task.title,
          startISO,
          endISO,
          task.id,
          taskColor,
        ],
      );

      taskBlockIds.push(eventId);
      scheduled.push({
        id: eventId,
        task_id: task.id,
        title: task.title,
        start_time: startISO,
        end_time: endISO,
      });
      addOccupiedInterval(occupiedIntervals, {
        start: slotStart,
        end: slotEnd,
      });
    };

    if (!taskSplit) {
      const slot = findSolidSlot({
        occupiedIntervals,
        windows,
        startAt: organizingStart,
        durationMins: remaining,
      });

      if (!slot) {
        unscheduled.push(task);
      } else {
        await persistScheduledBlock(slot.start, slot.end);
      }
    } else {
      let searchCursor = new Date(organizingStart);

      while (remaining > 0) {
        const chunk = findNextSplitChunk({
          occupiedIntervals,
          windows,
          startAt: searchCursor,
          remainingMins: remaining,
        });

        if (!chunk) {
          unscheduled.push(task);
          break;
        }

        await persistScheduledBlock(chunk.start, chunk.end);
        remaining -= chunk.minsScheduled;
        searchCursor = chunk.resumeAt;
      }
    }

    if (taskBlockIds.length > 0) {
      await dbRun(
        "UPDATE tasks SET calendar_event_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        [taskBlockIds[0], task.id, userId],
      );
    }
  }

  return { scheduled, unscheduled: unscheduled.map((t) => t.id) };
}

module.exports = { organizeTasks };
