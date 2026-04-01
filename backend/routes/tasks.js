// routes/tasks.js — full task CRUD with SQLite

const express = require("express");
const crypto = require("crypto");
const db = require("../db/database");
const gcal = require("../services/googleCalendar");

const router = express.Router();

const ALLOWED_FIELDS = ["title", "description", "status", "priority", "difficulty",
  "estimated_mins", "due_date", "scheduled_date", "tags", "next_step", "breakdown_json",
  "current_subtask_index", "current_sprint_goal", "position", "calendar_event_id"];

// GET /api/tasks
router.get("/", (req, res) => {
  let query = "SELECT * FROM tasks";
  const params = [];
  const conditions = [];

  if (req.query.status) {
    conditions.push("status = ?");
    params.push(req.query.status);
  }
  if (req.query.priority) {
    conditions.push("priority = ?");
    params.push(req.query.priority);
  }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY position ASC, created_at ASC";

  const tasks = db.prepare(query).all(...params);
  // Parse tags JSON for each task
  const parsed = tasks.map(t => ({ ...t, tags: safeParseJSON(t.tags, []) }));
  res.json({ tasks: parsed });
});

// POST /api/tasks
router.post("/", (req, res) => {
  const id = crypto.randomUUID();
  const maxPos = db.prepare("SELECT MAX(position) as m FROM tasks").get();
  const position = (maxPos?.m ?? 0) + 1;

  const task = {
    id,
    title: req.body.title ?? "New task",
    description: req.body.description ?? "",
    status: req.body.status ?? "Not Started",
    priority: req.body.priority ?? "Medium",
    difficulty: req.body.difficulty ?? "Easy",
    estimated_mins: req.body.estimated_mins ?? 30,
    due_date: req.body.due_date ?? null,
    scheduled_date: req.body.scheduled_date ?? null,
    tags: JSON.stringify(req.body.tags ?? []),
    next_step: req.body.next_step ?? "",
    breakdown_json: req.body.breakdown_json ?? "",
    current_subtask_index: req.body.current_subtask_index ?? 0,
    current_sprint_goal: req.body.current_sprint_goal ?? "",
    position,
    calendar_event_id: null,
  };

  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, difficulty,
      estimated_mins, due_date, scheduled_date, tags, next_step, breakdown_json, current_subtask_index, current_sprint_goal, position, calendar_event_id)
    VALUES (@id, @title, @description, @status, @priority, @difficulty,
      @estimated_mins, @due_date, @scheduled_date, @tags, @next_step, @breakdown_json, @current_subtask_index, @current_sprint_goal, @position, @calendar_event_id)
  `).run(task);

  const created = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  res.status(201).json({ task: { ...created, tags: safeParseJSON(created.tags, []) } });
});

// GET /api/tasks/:id
router.get("/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task: { ...task, tags: safeParseJSON(task.tags, []) } });
});

// PATCH /api/tasks/:id
router.patch("/:id", async (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const updates = [];
  const params = [];

  for (const field of ALLOWED_FIELDS) {
    if (field in req.body) {
      updates.push(`${field} = ?`);
      params.push(field === "tags" ? JSON.stringify(req.body[field]) : req.body[field]);
    }
  }

  if (updates.length === 0) return res.json({ task: { ...task, tags: safeParseJSON(task.tags, []) } });

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);

  // Auto-sync linked calendar event when title, duration, or status changes
  if (updated.calendar_event_id && ("title" in req.body || "estimated_mins" in req.body || "status" in req.body)) {
    const ev = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(updated.calendar_event_id);
    if (ev) {
      const calUpdates = {};
      if ("title" in req.body) calUpdates.title = updated.title;
      if ("estimated_mins" in req.body) {
        const startMs = new Date(ev.start_time).getTime();
        const newEndMs = startMs + (updated.estimated_mins ?? 30) * 60_000;
        const startDate = ev.start_time.slice(0, 10);
        const capMs = new Date(`${startDate}T23:00:00`).getTime();
        const endDate = new Date(Math.min(newEndMs, capMs));
        const p = n => String(n).padStart(2, "0");
        calUpdates.end_time = `${startDate}T${p(endDate.getHours())}:${p(endDate.getMinutes())}:00`;
      }
      if ("status" in req.body) {
        calUpdates.event_type = updated.status === "Done" ? "completed" : "task_block";
      }

      if (Object.keys(calUpdates).length > 0) {
        const setClauses = Object.keys(calUpdates).map(k => `${k} = ?`).join(", ");
        db.prepare(`UPDATE calendar_events SET ${setClauses}, synced_at = datetime('now') WHERE id = ?`)
          .run(...Object.values(calUpdates), updated.calendar_event_id);

        // Push title/time to Google Calendar (best-effort, don't await blocking response)
        const gcalConnected = !!db.prepare("SELECT id FROM google_credentials WHERE id = 1").get();
        if (ev.google_event_id && gcalConnected && (calUpdates.title !== undefined || calUpdates.end_time !== undefined)) {
          gcal.updateEvent(ev.google_event_id, {
            title: calUpdates.title ?? ev.title,
            startTime: ev.start_time,
            endTime: calUpdates.end_time ?? ev.end_time,
          }).catch(e => console.error("GCal task-sync failed:", e.message));
        }
      }
    }
  }

  if ("status" in req.body && updated.status === "Done") {
    db.prepare(`
      UPDATE calendar_events
      SET block_state = 'done',
          event_type = CASE WHEN event_type = 'task_block' THEN 'completed' ELSE event_type END,
          synced_at = datetime('now')
      WHERE task_id = ?
    `).run(updated.id);
  }

  res.json({ task: { ...updated, tags: safeParseJSON(updated.tags, []) } });
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  // Remove linked calendar event first
  if (task.calendar_event_id) {
    const ev = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(task.calendar_event_id);
    if (ev) {
      const gcalConnected = !!db.prepare("SELECT id FROM google_credentials WHERE id = 1").get();
      if (ev.google_event_id && gcalConnected) {
        try { await gcal.deleteEvent(ev.google_event_id); } catch (e) {
          console.error("GCal delete failed:", e.message);
        }
      }
      db.prepare("DELETE FROM calendar_events WHERE id = ?").run(ev.id);
    }
  }

  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
