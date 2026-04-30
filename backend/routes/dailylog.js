// routes/dailylog.js — morning plans and evening reviews

const express = require("express");
const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");
const { safeParseJSON } = require("../utils/json");
const { generateDayPlan, generateEveningReview } = require("../services/openai");

const router = express.Router();

async function getOrCreateLog(userId, date) {
  let log = await dbGet("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", [userId, date]);
  if (!log) {
    const id = crypto.randomUUID();
    await dbRun("INSERT INTO daily_logs (id, user_id, date) VALUES (?, ?, ?)", [id, userId, date]);
    log = await dbGet("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", [userId, date]);
  }
  return log;
}

// GET /api/daily-log/:date
router.get("/:date", async (req, res) => {
  const log = await getOrCreateLog(req.user.id, req.params.date);
  res.json({ log });
});

// PATCH /api/daily-log/:date — update morning_note or evening_note
router.patch("/:date", async (req, res) => {
  await getOrCreateLog(req.user.id, req.params.date);

  const updates = [];
  const params = [];

  if (req.body.morning_note !== undefined) { updates.push("morning_note = ?"); params.push(req.body.morning_note); }
  if (req.body.evening_note !== undefined) { updates.push("evening_note = ?"); params.push(req.body.evening_note); }

  if (updates.length === 0) {
    return res.json({
      log: await dbGet("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", [req.user.id, req.params.date]),
    });
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(req.user.id, req.params.date);

  await dbRun(`UPDATE daily_logs SET ${updates.join(", ")} WHERE user_id = ? AND date = ?`, params);
  res.json({
    log: await dbGet("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", [req.user.id, req.params.date]),
  });
});

// POST /api/daily-log/:date/ai-plan — generate AI schedule for the day
router.post("/:date/ai-plan", async (req, res) => {
  const date = req.params.date;
  const userId = req.user.id;
  const log = await getOrCreateLog(userId, date);

  const tasks = (await dbAll(
    "SELECT * FROM tasks WHERE user_id = ? AND status != 'Done' ORDER BY position ASC",
    [userId]
  ))
    .map(t => ({ ...t, tags: safeParseJSON(t.tags, []) }));

  const events = await dbAll(`
    SELECT * FROM calendar_events
    WHERE user_id = ?
      AND date(start_time) = date(?)
    ORDER BY start_time ASC
  `, [userId, date]);

  try {
    const plan = await generateDayPlan({ date, tasks, events, morningNote: log.morning_note });
    const aiPlanStr = JSON.stringify(plan);

    await dbRun(
      "UPDATE daily_logs SET ai_plan = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND date = ?",
      [aiPlanStr, userId, date]
    );

    res.json({
      plan,
      log: await dbGet("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", [userId, date]),
    });
  } catch (err) {
    console.error("AI plan error:", err.message);
    res.status(502).json({ error: "AI planning failed", detail: err.message });
  }
});

// POST /api/daily-log/:date/ai-review — generate evening review
router.post("/:date/ai-review", async (req, res) => {
  const date = req.params.date;
  const userId = req.user.id;
  await getOrCreateLog(userId, date);

  const [sessions, checkins, completedRow] = await Promise.all([
    dbAll(`
      SELECT fs.*, t.title as task_title
      FROM focus_sessions fs
      LEFT JOIN tasks t ON fs.task_id = t.id
      WHERE fs.user_id = ?
        AND date(fs.started_at) = date(?)
        AND fs.ended_at IS NOT NULL
    `, [userId, date]),
    dbAll(
      "SELECT * FROM accountability_checkins WHERE user_id = ? AND date(prompted_at) = date(?)",
      [userId, date]
    ),
    dbGet(
      "SELECT COUNT(*)::int as count FROM tasks WHERE user_id = ? AND status = 'Done' AND date(updated_at) = date(?)",
      [userId, date]
    ),
  ]);

  try {
    const review = await generateEveningReview({ date, sessions, checkins, completedCount: completedRow.count });

    await dbRun(
      "UPDATE daily_logs SET ai_review = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND date = ?",
      [review, userId, date]
    );

    res.json({
      review,
      log: await dbGet("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?", [userId, date]),
    });
  } catch (err) {
    console.error("Evening review error:", err.message);
    res.status(502).json({ error: "AI review failed", detail: err.message });
  }
});

module.exports = router;
