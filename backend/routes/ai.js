// routes/ai.js — AI-powered scheduling, planning, and accountability endpoints

const express = require("express");
const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");
const openai = require("../services/openai");
const gcal = require("../services/googleCalendar");
const { latestUnresolvedMissedBlock, getTaskBlockById } = require("../services/taskBlockRecovery");

const router = express.Router();

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function normalizeStepList(steps) {
  return (steps ?? [])
    .map((step) => String(step ?? "").trim())
    .filter(Boolean)
    .map((step) => step.replace(/^\d+\.\s+/, "").trim());
}

async function taskFromRequest(userId, taskId, fields = {}) {
  if (taskId) {
    const task = await dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [taskId, userId]);
    return task ?? null;
  }

  return {
    id: null,
    title: fields.title ?? "",
    description: fields.notes ?? "",
    status: fields.status ?? "Not Started",
    priority: fields.priority ?? "Medium",
    difficulty: fields.difficulty ?? "Easy",
    estimated_mins: fields.estimated_mins ?? 30,
    next_step: fields.next_step ?? "",
    breakdown_json: fields.breakdown_json ?? "",
    current_sprint_goal: fields.current_sprint_goal ?? "",
  };
}

// POST /api/ai/suggest-slots
router.post("/suggest-slots", async (req, res) => {
  const userId = req.user.id;
  const { task_id, date } = req.body;
  if (!task_id) return res.status(400).json({ error: "task_id required" });

  const task = await dbGet("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [task_id, userId]);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const targetDate = date ?? new Date().toISOString().split("T")[0];
  const dayStart = `${targetDate}T00:00:00.000Z`;
  const dayEnd = `${targetDate}T23:59:59.999Z`;

  const events = await dbAll(`
    SELECT * FROM calendar_events
    WHERE user_id = ?
      AND start_time <= ? AND end_time >= ?
    ORDER BY start_time ASC
  `, [userId, dayEnd, dayStart]);

  const freeSlots = gcal.computeFreeSlots(events, targetDate);

  try {
    const result = await openai.suggestSlots({
      task: { ...task, tags: safeParseJSON(task.tags, []) },
      freeSlots,
    });
    res.json(result);
  } catch (err) {
    console.error("suggest-slots error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/ai/schedule-day
router.post("/schedule-day", async (req, res) => {
  const userId = req.user.id;
  const date = req.body.date ?? new Date().toISOString().split("T")[0];
  const morningNote = req.body.morning_note ?? "";

  const tasks = (await dbAll(
    "SELECT * FROM tasks WHERE user_id = ? AND status != 'Done' ORDER BY position ASC",
    [userId]
  ))
    .map(t => ({ ...t, tags: safeParseJSON(t.tags, []) }));

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  const events = await dbAll(`
    SELECT * FROM calendar_events
    WHERE user_id = ?
      AND start_time <= ? AND end_time >= ?
    ORDER BY start_time ASC
  `, [userId, dayEnd, dayStart]);

  try {
    const plan = await openai.generateDayPlan({ date, tasks, events, morningNote });
    res.json(plan);
  } catch (err) {
    console.error("schedule-day error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/ai/checkin-response
router.post("/checkin-response", async (req, res) => {
  const { task_id, task_title, outcome, notes = "" } = req.body;

  let title = task_title;
  if (!title && task_id) {
    const task = await dbGet("SELECT title FROM tasks WHERE id = ? AND user_id = ?", [task_id, req.user.id]);
    title = task?.title ?? "Unknown task";
  }

  if (!outcome) return res.status(400).json({ error: "outcome required" });

  try {
    const message = await openai.generateCheckinResponse({ taskTitle: title ?? "Unknown task", outcome, notes });
    res.json({ message });
  } catch (err) {
    console.error("checkin-response error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/ai/evening-review
router.post("/evening-review", async (req, res) => {
  const userId = req.user.id;
  const date = req.body.date ?? new Date().toISOString().split("T")[0];

  const [sessions, checkins, completedRow] = await Promise.all([
    dbAll(`
      SELECT fs.*, t.title as task_title
      FROM focus_sessions fs
      LEFT JOIN tasks t ON fs.task_id = t.id
      WHERE fs.user_id = ?
        AND date(fs.started_at) = date(?)
        AND fs.ended_at IS NOT NULL
    `, [userId, date]),
    dbAll("SELECT * FROM accountability_checkins WHERE user_id = ? AND date(prompted_at) = date(?)", [userId, date]),
    dbGet("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'Done' AND date(updated_at) = date(?)", [userId, date]),
  ]);

  try {
    const review = await openai.generateEveningReview({ date, sessions, checkins, completedCount: completedRow.count });
    res.json({ review });
  } catch (err) {
    console.error("evening-review error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

router.post("/recover-block", async (req, res) => {
  const userId = req.user.id;
  const block = req.body.block_id
    ? await getTaskBlockById(userId, req.body.block_id)
    : await latestUnresolvedMissedBlock(userId, new Date());

  if (!block) return res.status(404).json({ error: "Missed block not found" });
  if (!block.task_id) return res.status(400).json({ error: "Missed block is not linked to a task" });

  try {
    const recommendation = await openai.recoverMissedBlock({
      task: {
        id: block.task_id,
        title: block.task_title ?? block.title,
        description: block.task_description ?? "",
        priority: block.task_priority ?? "Medium",
        difficulty: block.task_difficulty ?? "Easy",
        estimated_mins: block.task_estimated_mins ?? 30,
      },
      block,
      options: block.recovery_options ?? req.body.options ?? {},
    });
    res.json(recommendation);
  } catch (err) {
    console.error("recover-block error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

router.post("/task-breakdown", async (req, res) => {
  const task = await taskFromRequest(req.user.id, req.body.task_id, req.body);
  if (!task || !task.title?.trim()) {
    return res.status(400).json({ error: "task_id or title required" });
  }

  try {
    const result = await openai.generateTaskBreakdown({
      taskTitle: task.title,
      notes: req.body.notes ?? task.description ?? "",
      context: req.body.context ?? "",
    });
    const steps = normalizeStepList(result.steps);

    if (req.body.task_id) {
      const firstStep = steps[0] ?? "";
      await dbRun(`
        UPDATE tasks
        SET breakdown_json = ?,
            current_subtask_index = 0,
            next_step = ?,
            current_sprint_goal = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `, [JSON.stringify(steps), firstStep, firstStep, req.body.task_id, req.user.id]);
    }

    res.json({ steps });
  } catch (err) {
    console.error("task-breakdown error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

router.post("/task-next-step", async (req, res) => {
  const task = await taskFromRequest(req.user.id, req.body.task_id, req.body);
  if (!task || !task.title?.trim()) {
    return res.status(400).json({ error: "task_id or title required" });
  }

  try {
    const result = await openai.generateTaskNextStep({
      taskTitle: task.title,
      notes: req.body.notes ?? task.description ?? "",
      context: req.body.context ?? "",
      recentState: req.body.recent_state ?? {
        status: task.status,
        priority: task.priority,
        difficulty: task.difficulty,
        estimated_mins: task.estimated_mins,
        next_step: task.next_step ?? "",
        breakdown: safeParseJSON(task.breakdown_json, []),
      },
    });

    if (req.body.task_id) {
      await dbRun(
        "UPDATE tasks SET next_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        [result.next_step ?? "", req.body.task_id, req.user.id]
      );
    }

    res.json({ next_step: result.next_step ?? "" });
  } catch (err) {
    console.error("task-next-step error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

router.post("/sprint-goal", async (req, res) => {
  const task = await taskFromRequest(req.user.id, req.body.task_id, req.body);
  if (!task || !task.title?.trim()) {
    return res.status(400).json({ error: "task_id or title required" });
  }

  try {
    const result = await openai.generateSprintGoal({
      taskTitle: task.title,
      notes: req.body.notes ?? task.description ?? "",
      context: req.body.context ?? "",
      recentState: req.body.recent_state ?? {
        status: task.status,
        priority: task.priority,
        difficulty: task.difficulty,
        estimated_mins: task.estimated_mins,
        next_step: task.next_step ?? "",
      },
    });

    if (req.body.task_id) {
      await dbRun(
        "UPDATE tasks SET current_sprint_goal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        [result.goal ?? "", req.body.task_id, req.user.id]
      );
    }

    res.json({ goal: result.goal ?? "" });
  } catch (err) {
    console.error("sprint-goal error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/ai/organize-calendar
router.post("/organize-calendar", async (req, res) => {
  const userId = req.user.id;
  const {
    date,
    strategy = "priority",
    allow_split = false,
    work_start = "09:00",
    work_end = "18:00",
  } = req.body;

  const targetDate = date ?? new Date().toISOString().split("T")[0];
  const dayStart = `${targetDate}T00:00:00.000Z`;
  const dayEnd = `${targetDate}T23:59:59.999Z`;

  const allPending = (await dbAll(`
    SELECT * FROM tasks
    WHERE user_id = ?
      AND status != 'Done'
      AND (scheduled_date = ? OR scheduled_date IS NULL)
    ORDER BY position ASC
  `, [userId, targetDate])).map(t => ({ ...t, tags: safeParseJSON(t.tags, []) }));

  if (allPending.length === 0) {
    return res.json({ blocks: [], unscheduled: [], summary: "No pending tasks to schedule.", events: [] });
  }

  const existingEvents = await dbAll(`
    SELECT * FROM calendar_events
    WHERE user_id = ?
      AND start_time <= ? AND end_time >= ?
    ORDER BY start_time ASC
  `, [userId, dayEnd, dayStart]);

  const freeSlots = gcal.computeFreeSlots(existingEvents, targetDate, work_start, work_end);

  try {
    const result = await openai.organizeCalendar({
      date: targetDate,
      tasks: allPending,
      existingEvents,
      freeSlots,
      strategy,
      allowSplit: allow_split,
      workStart: work_start,
      workEnd: work_end,
    });

    // Remove existing task_block events for these tasks on this date
    const taskIds = allPending.map(t => t.id);
    for (const taskId of taskIds) {
      const existing = await dbGet(`
        SELECT id FROM calendar_events
        WHERE event_type = 'task_block'
          AND user_id = ?
          AND start_time >= ? AND start_time <= ?
          AND id IN (SELECT calendar_event_id FROM tasks WHERE id = ? AND user_id = ?)
      `, [userId, dayStart, dayEnd, taskId, userId]);
      if (existing) {
        await dbRun("DELETE FROM calendar_events WHERE id = ? AND user_id = ?", [existing.id, userId]);
      }
    }

    const createdEvents = [];
    for (const block of result.blocks ?? []) {
      const eventId = crypto.randomUUID();
      const task = allPending.find(t => t.id === block.task_id);
      const title = block.title ?? task?.title ?? "Task block";

      await dbRun(`
        INSERT INTO calendar_events
          (id, user_id, google_event_id, google_cal_id, title, description, start_time, end_time, event_type, task_id, block_state, color, color_id, synced_at)
        VALUES (?, ?, NULL, 'primary', ?, ?, ?, ?, 'task_block', ?, 'scheduled', 'indigo', 'blueberry', CURRENT_TIMESTAMP)
      `, [eventId, userId, title, task?.description ?? "", block.start_time, block.end_time, block.task_id ?? null]);

      if (block.task_id && (!block.split_part || block.split_part === 1)) {
        await dbRun(
          "UPDATE tasks SET calendar_event_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
          [eventId, block.task_id, userId]
        );
      }

      createdEvents.push(await dbGet("SELECT * FROM calendar_events WHERE id = ? AND user_id = ?", [eventId, userId]));
    }

    res.json({
      blocks: result.blocks ?? [],
      unscheduled: result.unscheduled ?? [],
      summary: result.summary ?? "",
      events: createdEvents,
    });
  } catch (err) {
    console.error("organize-calendar error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
