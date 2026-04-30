// routes/calendar.js — Google Calendar sync and event management

const express = require("express");
const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");
const gcal = require("../services/googleCalendar");
const { organizeTasks } = require("../services/taskOrganizer");

const router = express.Router();

async function hasCalendarConnection(userId) {
  const { hasGoogleCalendarConnection } = await import("../auth.mjs");
  return hasGoogleCalendarConnection(userId);
}

// GET /api/calendar/events?start=ISO&end=ISO
router.get("/events", async (req, res) => {
  let query = "SELECT * FROM calendar_events WHERE user_id = ?";
  const params = [req.user.id];
  const conditions = [];

  if (req.query.start) {
    conditions.push("start_time >= ?");
    params.push(req.query.start);
  }
  if (req.query.end) {
    conditions.push("end_time <= ?");
    params.push(req.query.end);
  }

  if (conditions.length) query += " AND " + conditions.join(" AND ");
  query += " ORDER BY start_time ASC";

  const events = await dbAll(query, params);
  res.json({ events });
});

// POST /api/calendar/sync — pull events from Google Calendar into local cache
router.post("/sync", async (req, res) => {
  const userId = req.user.id;
  if (!(await hasCalendarConnection(userId))) {
    return res.status(401).json({ error: "Google Calendar not connected" });
  }

  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 6);

  try {
    const googleEvents = await gcal.listEvents(
      userId,
      start.toISOString(),
      end.toISOString(),
    );

    for (const e of googleEvents) {
      const existing = await dbGet(
        "SELECT id FROM calendar_events WHERE user_id = ? AND google_event_id = ?",
        [userId, e.id],
      );

      if (existing) {
        await dbRun(
          `
          UPDATE calendar_events
          SET title = ?,
              description = ?,
              location = ?,
              start_time = ?,
              end_time = ?,
              all_day = ?,
              color_id = ?,
              synced_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `,
          [
            e.title,
            e.description,
            e.location ?? "",
            e.start_time,
            e.end_time,
            e.all_day ? 1 : 0,
            e.color_id ?? "",
            existing.id,
            userId,
          ],
        );
      } else {
        await dbRun(
          `
          INSERT INTO calendar_events
            (id, user_id, google_event_id, google_cal_id, title, description, location, start_time, end_time, all_day, event_type, color, color_id, synced_at)
          VALUES (?, ?, ?, 'primary', ?, ?, ?, ?, ?, ?, 'external', 'blue', ?, CURRENT_TIMESTAMP)
        `,
          [
            crypto.randomUUID(),
            userId,
            e.id,
            e.title,
            e.description,
            e.location ?? "",
            e.start_time,
            e.end_time,
            e.all_day ? 1 : 0,
            e.color_id ?? "",
          ],
        );
      }
    }

    res.json({ synced: googleEvents.length, events: googleEvents });
  } catch (err) {
    console.error("Calendar sync error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/calendar/events — create event in Google Calendar + cache locally
router.post("/events", async (req, res) => {
  const userId = req.user.id;
  const {
    title,
    description = "",
    location = "",
    start_time,
    end_time,
    all_day = false,
    color = "blue",
    color_id = "",
    task_id,
  } = req.body;

  if (!title || !start_time || !end_time) {
    return res
      .status(400)
      .json({ error: "title, start_time, and end_time are required" });
  }

  try {
    const googleEvent = await gcal.createEvent(userId, {
      title,
      description,
      location,
      startTime: start_time,
      endTime: end_time,
      colorId: color_id,
    });

    const localId = crypto.randomUUID();
    const eventType = task_id ? "task_block" : "external";
    await dbRun(
      `
      INSERT INTO calendar_events
        (id, user_id, google_event_id, google_cal_id, title, description, location, start_time, end_time, all_day, event_type, task_id, block_state, color, color_id, synced_at)
      VALUES (?, ?, ?, 'primary', ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, CURRENT_TIMESTAMP)
    `,
      [
        localId,
        userId,
        googleEvent.id,
        title,
        description,
        location,
        start_time,
        end_time,
        all_day ? 1 : 0,
        eventType,
        task_id ?? null,
        color,
        color_id,
      ],
    );

    if (task_id) {
      await dbRun(
        "UPDATE tasks SET calendar_event_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        [localId, task_id, userId],
      );
    }

    const saved = await dbGet(
      "SELECT * FROM calendar_events WHERE id = ? AND user_id = ?",
      [localId, userId],
    );
    res.status(201).json({ event: saved });
  } catch (err) {
    console.error("Create event error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/calendar/events/:id — update event in Google Calendar + local cache
router.patch("/events/:id", async (req, res) => {
  const userId = req.user.id;
  const event = await dbGet(
    "SELECT * FROM calendar_events WHERE id = ? AND user_id = ?",
    [req.params.id, userId],
  );
  if (!event) return res.status(404).json({ error: "Event not found" });

  const {
    title,
    description,
    location,
    start_time,
    end_time,
    all_day,
    color,
    color_id,
    task_id,
    block_state,
  } = req.body;

  try {
    if (event.google_event_id) {
      await gcal.updateEvent(userId, event.google_event_id, {
        title,
        description,
        location,
        startTime: start_time,
        endTime: end_time,
        colorId: color_id,
      });
    }

    const updates = [];
    const params = [];
    if (title !== undefined) {
      updates.push("title = ?");
      params.push(title);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description);
    }
    if (location !== undefined) {
      updates.push("location = ?");
      params.push(location);
    }
    if (start_time !== undefined) {
      updates.push("start_time = ?");
      params.push(start_time);
    }
    if (end_time !== undefined) {
      updates.push("end_time = ?");
      params.push(end_time);
    }
    if (all_day !== undefined) {
      updates.push("all_day = ?");
      params.push(all_day ? 1 : 0);
    }
    if (color !== undefined) {
      updates.push("color = ?");
      params.push(color);
    }
    if (color_id !== undefined) {
      updates.push("color_id = ?");
      params.push(color_id);
    }
    if (task_id !== undefined) {
      updates.push("task_id = ?");
      params.push(task_id);
    }
    if (block_state !== undefined) {
      updates.push("block_state = ?");
      params.push(block_state);
    }

    if (updates.length > 0) {
      updates.push("synced_at = CURRENT_TIMESTAMP");
      params.push(req.params.id, userId);
      await dbRun(
        `UPDATE calendar_events SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
        params,
      );
    }

    const updated = await dbGet(
      "SELECT * FROM calendar_events WHERE id = ? AND user_id = ?",
      [req.params.id, userId],
    );
    res.json({ event: updated });
  } catch (err) {
    console.error("Update event error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/calendar/events/:id — delete from Google Calendar + local cache
router.delete("/events/:id", async (req, res) => {
  const userId = req.user.id;
  const event = await dbGet(
    "SELECT * FROM calendar_events WHERE id = ? AND user_id = ?",
    [req.params.id, userId],
  );
  if (!event) return res.status(404).json({ error: "Event not found" });

  try {
    if (event.google_event_id) {
      await gcal.deleteEvent(userId, event.google_event_id);
    }
    await dbRun("DELETE FROM calendar_events WHERE id = ? AND user_id = ?", [
      req.params.id,
      userId,
    ]);
    await dbRun(
      "UPDATE tasks SET calendar_event_id = NULL WHERE calendar_event_id = ? AND user_id = ?",
      [req.params.id, userId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete event error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/calendar/organize — deterministic task-to-calendar scheduling
router.post("/organize", async (req, res) => {
  try {
    const scheduled = await organizeTasks(req.user.id, {
      date: req.body.date ?? null,
      start_from_now: req.body.start_from_now ?? false,
    });
    res.json(scheduled);
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

  const events = await dbAll(
    `
    SELECT * FROM calendar_events
    WHERE user_id = ?
      AND start_time <= ? AND end_time >= ?
    ORDER BY start_time ASC
  `,
    [req.user.id, dayEnd, dayStart],
  );

  const slots = gcal.computeFreeSlots(events, date, workStart, workEnd);
  res.json({ date, slots });
});

module.exports = router;
