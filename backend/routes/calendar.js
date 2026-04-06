// routes/calendar.js — Google Calendar sync and event management

const express = require("express");
const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");
const gcal = require("../services/googleCalendar");
const {
  latestUnresolvedMissedBlock,
  dismissMissedBlock,
  rescheduleBlock,
  startRecoverySprint,
} = require("../services/taskBlockRecovery");

const router = express.Router();

// GET /api/calendar/events?start=ISO&end=ISO
router.get("/events", async (req, res) => {
  let query = "SELECT * FROM calendar_events";
  const params = [];
  const conditions = [];

  if (req.query.start) {
    conditions.push("start_time >= ?");
    params.push(req.query.start);
  }
  if (req.query.end) {
    conditions.push("end_time <= ?");
    params.push(req.query.end);
  }

  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY start_time ASC";

  const events = await dbAll(query, params);
  res.json({ events });
});

router.get("/missed-blocks/latest", async (req, res) => {
  const block = await latestUnresolvedMissedBlock(new Date());
  if (!block) {
    return res.json({ block: null });
  }
  res.json({ block });
});

router.post("/missed-blocks/:id/dismiss", async (req, res) => {
  const block = await dbGet("SELECT id FROM calendar_events WHERE id = ?", [req.params.id]);
  if (!block) return res.status(404).json({ error: "Missed block not found" });

  const hiddenUntil = await dismissMissedBlock(req.params.id, new Date());
  res.json({ ok: true, hidden_until: hiddenUntil });
});

router.post("/missed-blocks/:id/start-sprint", async (req, res) => {
  try {
    const result = await startRecoverySprint(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/missed-blocks/:id/move-next-open-slot", async (req, res) => {
  try {
    const result = await rescheduleBlock(req.params.id, "move_next_open_slot");
    res.json(result);
  } catch (err) {
    console.error("Move to next open slot error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/missed-blocks/:id/defer-tomorrow", async (req, res) => {
  try {
    const result = await rescheduleBlock(req.params.id, "defer_tomorrow");
    res.json(result);
  } catch (err) {
    console.error("Defer to tomorrow error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/calendar/sync — pull events from Google Calendar into local cache
router.post("/sync", async (req, res) => {
  const creds = await dbGet("SELECT id FROM google_credentials WHERE id = 1");
  if (!creds) return res.status(401).json({ error: "Google Calendar not connected" });

  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 6);

  try {
    const googleEvents = await gcal.listEvents(start.toISOString(), end.toISOString());

    for (const e of googleEvents) {
      await dbRun(`
        INSERT INTO calendar_events
          (id, google_event_id, google_cal_id, title, description, location, start_time, end_time, all_day, event_type, color, color_id, synced_at)
        VALUES (?, ?, 'primary', ?, ?, ?, ?, ?, ?, 'external', 'blue', ?, datetime('now'))
        ON CONFLICT(google_event_id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          location = excluded.location,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          all_day = excluded.all_day,
          color_id = excluded.color_id,
          synced_at = datetime('now')
      `, [e.id, e.id, e.title, e.description, e.location ?? "", e.start_time, e.end_time,
          e.all_day ? 1 : 0, e.color_id ?? ""]);
    }

    res.json({ synced: googleEvents.length, events: googleEvents });
  } catch (err) {
    console.error("Calendar sync error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/calendar/events — create event in Google Calendar + cache locally
router.post("/events", async (req, res) => {
  const { title, description = "", location = "", start_time, end_time, all_day = false, color = "blue", color_id = "", task_id } = req.body;

  if (!title || !start_time || !end_time) {
    return res.status(400).json({ error: "title, start_time, and end_time are required" });
  }

  try {
    const googleEvent = await gcal.createEvent({ title, description, location, startTime: start_time, endTime: end_time, colorId: color_id });

    const localId = googleEvent.id;
    const eventType = task_id ? "task_block" : "external";
    await dbRun(`
      INSERT OR REPLACE INTO calendar_events
        (id, google_event_id, google_cal_id, title, description, location, start_time, end_time, all_day, event_type, task_id, block_state, color, color_id, synced_at)
      VALUES (?, ?, 'primary', ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, datetime('now'))
    `, [localId, localId, title, description, location, start_time, end_time,
        all_day ? 1 : 0, eventType, task_id ?? null, color, color_id]);

    if (task_id) {
      await dbRun(
        "UPDATE tasks SET calendar_event_id = ?, updated_at = datetime('now') WHERE id = ?",
        [localId, task_id]
      );
    }

    const saved = await dbGet("SELECT * FROM calendar_events WHERE id = ?", [localId]);
    res.status(201).json({ event: saved });
  } catch (err) {
    console.error("Create event error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/calendar/events/:id — update event in Google Calendar + local cache
router.patch("/events/:id", async (req, res) => {
  const event = await dbGet("SELECT * FROM calendar_events WHERE id = ?", [req.params.id]);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const { title, description, location, start_time, end_time, all_day, color, color_id, task_id, block_state } = req.body;

  try {
    if (event.google_event_id) {
      await gcal.updateEvent(event.google_event_id, { title, description, location, startTime: start_time, endTime: end_time, colorId: color_id });
    }

    const updates = [];
    const params = [];
    if (title !== undefined)       { updates.push("title = ?");       params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (location !== undefined)    { updates.push("location = ?");    params.push(location); }
    if (start_time !== undefined)  { updates.push("start_time = ?");  params.push(start_time); }
    if (end_time !== undefined)    { updates.push("end_time = ?");    params.push(end_time); }
    if (all_day !== undefined)     { updates.push("all_day = ?");     params.push(all_day ? 1 : 0); }
    if (color !== undefined)       { updates.push("color = ?");       params.push(color); }
    if (color_id !== undefined)    { updates.push("color_id = ?");    params.push(color_id); }
    if (task_id !== undefined)     { updates.push("task_id = ?");     params.push(task_id); }
    if (block_state !== undefined) { updates.push("block_state = ?"); params.push(block_state); }

    if (updates.length > 0) {
      updates.push("synced_at = datetime('now')");
      params.push(req.params.id);
      await dbRun(`UPDATE calendar_events SET ${updates.join(", ")} WHERE id = ?`, params);
    }

    const updated = await dbGet("SELECT * FROM calendar_events WHERE id = ?", [req.params.id]);
    res.json({ event: updated });
  } catch (err) {
    console.error("Update event error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/calendar/events/:id — delete from Google Calendar + local cache
router.delete("/events/:id", async (req, res) => {
  const event = await dbGet("SELECT * FROM calendar_events WHERE id = ?", [req.params.id]);
  if (!event) return res.status(404).json({ error: "Event not found" });

  try {
    if (event.google_event_id) {
      await gcal.deleteEvent(event.google_event_id);
    }
    await dbRun("DELETE FROM calendar_events WHERE id = ?", [req.params.id]);
    await dbRun("UPDATE tasks SET calendar_event_id = NULL WHERE calendar_event_id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete event error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/calendar/organize — deterministic task-to-calendar scheduling
router.post("/organize", async (req, res) => {
  const start_from_now = req.body.start_from_now ?? false;
  const date = start_from_now
    ? new Date().toISOString().split("T")[0]
    : (req.body.date ?? new Date().toISOString().split("T")[0]);

  const PRIORITY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const SLEEP_HOUR = 23;
  const OVERFLOW_HOUR = 8;
  const TASK_BLOCK_COLORS = ["#6366F1", "#A855F7", "#F59E0B", "#EC4899", "#14B8A6", "#EF4444", "#F97316"];
  const GCAL_COLOR_HEX = {
    tomato: "#D50000", flamingo: "#E67C73", tangerine: "#F4511E",
    banana: "#F6BF26", sage: "#33B679", basil: "#0B8043",
    peacock: "#039BE5", blueberry: "#3F51B5", lavender: "#7986CB",
    grape: "#8E24AA", graphite: "#616161",
  };

  function pad(n) { return String(n).padStart(2, "0"); }
  function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function localISO(d) { return `${dateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; }

  function snapTo30(d) {
    const r = new Date(d);
    r.setSeconds(0, 0);
    const m = r.getMinutes();
    const snapped = Math.ceil(m / 30) * 30;
    if (snapped >= 60) { r.setMinutes(0); r.setHours(r.getHours() + 1); }
    else { r.setMinutes(snapped); }
    return r;
  }

  function advancePastExternal(cursor, events) {
    let cur = new Date(cursor);
    let changed = true;
    while (changed) {
      changed = false;
      for (const ev of events) {
        const s = new Date(ev.start_time);
        const e = new Date(ev.end_time);
        if (cur >= s && cur < e) {
          cur = snapTo30(e);
          changed = true;
          break;
        }
      }
    }
    return cur;
  }

  try {
    const gcalConnected = !!(await dbGet("SELECT id FROM google_credentials WHERE id = 1"));

    const allTasksRaw = await dbAll("SELECT * FROM tasks WHERE status != 'Done' ORDER BY position ASC");
    const allTasks = allTasksRaw.sort((a, b) => {
      const pd = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
      return pd !== 0 ? pd : (a.position ?? 0) - (b.position ?? 0);
    });

    const dateObj = new Date(date + "T00:00:00");
    const nextDateObj = new Date(dateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateStr = dateStr(nextDateObj);

    const externalEvents = await dbAll(`
      SELECT * FROM calendar_events
      WHERE event_type = 'external'
      AND (date(start_time) = ? OR date(start_time) = ?)
      ORDER BY start_time ASC
    `, [date, nextDateStr]);

    const usedHexes = new Set(externalEvents.map(e => {
      if (e.color?.startsWith("#")) return e.color;
      return GCAL_COLOR_HEX[e.color_id] ?? null;
    }).filter(Boolean));
    const taskColor = TASK_BLOCK_COLORS.find(c => !usedHexes.has(c)) ?? TASK_BLOCK_COLORS[0];

    const nowISO = new Date().toISOString();
    const oldBlocks = start_from_now
      ? await dbAll(`
          SELECT * FROM calendar_events
          WHERE event_type IN ('task_block', 'completed')
          AND (date(start_time) = ? OR date(start_time) = ?)
          AND start_time >= ?
        `, [date, nextDateStr, nowISO])
      : await dbAll(`
          SELECT * FROM calendar_events
          WHERE event_type IN ('task_block', 'completed')
          AND (date(start_time) = ? OR date(start_time) = ?)
        `, [date, nextDateStr]);

    for (const ev of oldBlocks) {
      if (ev.google_event_id && gcalConnected) {
        try { await gcal.deleteEvent(ev.google_event_id); } catch (_) {}
      }
      await dbRun("DELETE FROM calendar_events WHERE id = ?", [ev.id]);
      await dbRun(
        "UPDATE tasks SET calendar_event_id = NULL, updated_at = datetime('now') WHERE calendar_event_id = ?",
        [ev.id]
      );
    }

    const today = dateStr(new Date());
    let cursor;
    if (start_from_now) {
      cursor = snapTo30(new Date());
      if (dateStr(cursor) !== date) {
        cursor = new Date(`${nextDateStr}T${pad(OVERFLOW_HOUR)}:00:00`);
      }
    } else if (date === today) {
      cursor = snapTo30(new Date());
      if (dateStr(cursor) !== date) {
        cursor = new Date(`${nextDateStr}T${pad(OVERFLOW_HOUR)}:00:00`);
      }
    } else {
      cursor = new Date(`${date}T${pad(OVERFLOW_HOUR)}:00:00`);
    }

    const scheduled = [];
    const unscheduled = [];

    for (const task of allTasks) {
      let remaining = task.estimated_mins ?? 30;
      const taskBlockIds = [];

      while (remaining > 0) {
        cursor = advancePastExternal(cursor, externalEvents);

        let curDate = dateStr(cursor);
        const sleep = new Date(`${curDate}T${pad(SLEEP_HOUR)}:00:00`);
        if (cursor >= sleep) {
          const next = new Date(cursor);
          next.setDate(next.getDate() + 1);
          curDate = dateStr(next);
          cursor = new Date(`${curDate}T${pad(OVERFLOW_HOUR)}:00:00`);
          cursor = advancePastExternal(cursor, externalEvents);
          const nextSleep = new Date(`${curDate}T${pad(SLEEP_HOUR)}:00:00`);
          if (cursor >= nextSleep) { unscheduled.push(task); remaining = 0; break; }
        }

        const potentialEnd = new Date(cursor.getTime() + remaining * 60_000);
        const blocking = externalEvents
          .filter(ev => new Date(ev.start_time) > cursor && new Date(ev.start_time) < potentialEnd)
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

        let blockEnd, minsScheduled;
        if (blocking) {
          blockEnd = new Date(blocking.start_time);
          minsScheduled = Math.round((blockEnd.getTime() - cursor.getTime()) / 60_000);
          if (minsScheduled < 10) {
            cursor = snapTo30(new Date(blocking.end_time));
            continue;
          }
        } else {
          blockEnd = potentialEnd;
          minsScheduled = remaining;
        }

        const sleepMs = new Date(`${dateStr(cursor)}T${pad(SLEEP_HOUR)}:00:00`).getTime();
        if (blockEnd.getTime() > sleepMs) {
          blockEnd = new Date(sleepMs);
          minsScheduled = Math.round((blockEnd.getTime() - cursor.getTime()) / 60_000);
        }

        if (minsScheduled <= 0) { cursor = sleep; continue; }

        const startISO = localISO(cursor);
        const endISO = localISO(blockEnd);

        let eventId = crypto.randomUUID();
        if (gcalConnected) {
          try {
            const gEv = await gcal.createEvent({ title: task.title, startTime: startISO, endTime: endISO });
            eventId = gEv.id;
          } catch (e) {
            console.error("GCal create failed:", e.message);
          }
        }

        await dbRun(`
          INSERT INTO calendar_events
            (id, google_event_id, google_cal_id, title, description, start_time, end_time, event_type, task_id, block_state, color, synced_at)
          VALUES (?, ?, 'primary', ?, '', ?, ?, 'task_block', ?, 'scheduled', ?, datetime('now'))
        `, [eventId, gcalConnected ? eventId : null, task.title, startISO, endISO, task.id, taskColor]);

        taskBlockIds.push(eventId);
        scheduled.push({ id: eventId, task_id: task.id, title: task.title, start_time: startISO, end_time: endISO });

        remaining -= minsScheduled;
        cursor = blockEnd;

        if (blocking && remaining > 0) {
          cursor = snapTo30(new Date(blocking.end_time));
        }
      }

      if (taskBlockIds.length > 0) {
        await dbRun(
          "UPDATE tasks SET calendar_event_id = ?, updated_at = datetime('now') WHERE id = ?",
          [taskBlockIds[0], task.id]
        );
      }
    }

    res.json({ scheduled, unscheduled: unscheduled.map(t => t.id) });
  } catch (err) {
    console.error("Organize error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendar/free-slots?date=YYYY-MM-DD
router.get("/free-slots", async (req, res) => {
  const date = req.query.date ?? new Date().toISOString().split("T")[0];
  const workStart = req.query.work_start ?? "09:00";
  const workEnd = req.query.work_end ?? "18:00";

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const events = await dbAll(`
    SELECT * FROM calendar_events
    WHERE start_time <= ? AND end_time >= ?
    ORDER BY start_time ASC
  `, [dayEnd, dayStart]);

  const slots = gcal.computeFreeSlots(events, date, workStart, workEnd);
  res.json({ date, slots });
});

module.exports = router;
