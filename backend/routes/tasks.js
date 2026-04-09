// routes/tasks.js — full task CRUD with Turso/libsql

const express = require("express");
const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");
const gcal = require("../services/googleCalendar");

const router = express.Router();

const ALLOWED_FIELDS = ["title", "description", "status", "priority", "difficulty",
  "estimated_mins", "due_date", "scheduled_date", "tags", "next_step", "breakdown_json",
  "current_subtask_index", "current_sprint_goal", "position", "calendar_event_id", "allow_split"];

// GET /api/tasks
router.get("/", async (req, res) => {
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

  const tasks = await dbAll(query, params);
  const parsed = tasks.map(t => ({ ...t, tags: safeParseJSON(t.tags, []) }));
  res.json({ tasks: parsed });
});

// POST /api/tasks
router.post("/", async (req, res) => {
  const id = crypto.randomUUID();
  const maxPos = await dbGet("SELECT MAX(position) as m FROM tasks");
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
    allow_split: req.body.allow_split ?? 1,
  };

  await dbRun(`
    INSERT INTO tasks (id, title, description, status, priority, difficulty,
      estimated_mins, due_date, scheduled_date, tags, next_step, breakdown_json,
      current_subtask_index, current_sprint_goal, position, calendar_event_id, allow_split)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [task.id, task.title, task.description, task.status, task.priority, task.difficulty,
      task.estimated_mins, task.due_date, task.scheduled_date, task.tags, task.next_step,
      task.breakdown_json, task.current_subtask_index, task.current_sprint_goal,
      task.position, task.calendar_event_id, task.allow_split]);

  const created = await dbGet("SELECT * FROM tasks WHERE id = ?", [id]);
  res.status(201).json({ task: { ...created, tags: safeParseJSON(created.tags, []) } });
});

// GET /api/tasks/:id
router.get("/:id", async (req, res) => {
  const task = await dbGet("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task: { ...task, tags: safeParseJSON(task.tags, []) } });
});

// PATCH /api/tasks/:id
router.patch("/:id", async (req, res) => {
  const task = await dbGet("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
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

  await dbRun(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, params);

  const updated = await dbGet("SELECT * FROM tasks WHERE id = ?", [req.params.id]);

  // Auto-sync linked calendar event when title, duration, or status changes
  if (updated.calendar_event_id && ("title" in req.body || "estimated_mins" in req.body || "status" in req.body)) {
    const ev = await dbGet("SELECT * FROM calendar_events WHERE id = ?", [updated.calendar_event_id]);
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
        await dbRun(
          `UPDATE calendar_events SET ${setClauses}, synced_at = datetime('now') WHERE id = ?`,
          [...Object.values(calUpdates), updated.calendar_event_id]
        );

        const gcalConnected = !!(await dbGet("SELECT id FROM google_credentials WHERE id = 1"));
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
    await clearFutureTaskBlocksForCompletedTask(updated.id);
  }

  res.json({ task: { ...updated, tags: safeParseJSON(updated.tags, []) } });
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res) => {
  const task = await dbGet("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (task.calendar_event_id) {
    const ev = await dbGet("SELECT * FROM calendar_events WHERE id = ?", [task.calendar_event_id]);
    if (ev) {
      const gcalConnected = !!(await dbGet("SELECT id FROM google_credentials WHERE id = 1"));
      if (ev.google_event_id && gcalConnected) {
        try { await gcal.deleteEvent(ev.google_event_id); } catch (e) {
          console.error("GCal delete failed:", e.message);
        }
      }
      await dbRun("DELETE FROM calendar_events WHERE id = ?", [ev.id]);
    }
  }

  await dbRun("DELETE FROM tasks WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

async function clearFutureTaskBlocksForCompletedTask(taskId) {
  const now = new Date();
  const gcalConnected = !!(await dbGet("SELECT id FROM google_credentials WHERE id = 1"));
  const blocks = await dbAll(`
    SELECT * FROM calendar_events
    WHERE task_id = ?
      AND event_type IN ('task_block', 'completed')
    ORDER BY start_time ASC
  `, [taskId]);

  for (const block of blocks) {
    const startsInFuture = new Date(block.start_time).getTime() > now.getTime();

    if (startsInFuture) {
      if (block.google_event_id && gcalConnected) {
        try {
          await gcal.deleteEvent(block.google_event_id);
        } catch (e) {
          console.error("GCal future task-block delete failed:", e.message);
        }
      }

      await dbRun("DELETE FROM calendar_events WHERE id = ?", [block.id]);
      continue;
    }

    await dbRun(`
      UPDATE calendar_events
      SET block_state = 'done',
          event_type = CASE WHEN event_type = 'task_block' THEN 'completed' ELSE event_type END,
          synced_at = datetime('now')
      WHERE id = ?
    `, [block.id]);
  }

  await dbRun(
    "UPDATE tasks SET calendar_event_id = NULL, updated_at = datetime('now') WHERE id = ?",
    [taskId]
  );
}

module.exports = router;
