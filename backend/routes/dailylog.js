// routes/dailylog.js — morning plans and evening reviews

const express = require("express");
const crypto = require("crypto");
const db = require("../db/database");
const { generateDayPlan, generateEveningReview } = require("../services/openai");

const router = express.Router();

function getOrCreateLog(date) {
  let log = db.prepare("SELECT * FROM daily_logs WHERE date = ?").get(date);
  if (!log) {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO daily_logs (id, date) VALUES (?, ?)
    `).run(id, date);
    log = db.prepare("SELECT * FROM daily_logs WHERE date = ?").get(date);
  }
  return log;
}

// GET /api/daily-log/:date
router.get("/:date", (req, res) => {
  const log = getOrCreateLog(req.params.date);
  res.json({ log });
});

// PATCH /api/daily-log/:date — update morning_note or evening_note
router.patch("/:date", (req, res) => {
  getOrCreateLog(req.params.date);

  const updates = [];
  const params = [];

  if (req.body.morning_note !== undefined) { updates.push("morning_note = ?"); params.push(req.body.morning_note); }
  if (req.body.evening_note !== undefined) { updates.push("evening_note = ?"); params.push(req.body.evening_note); }

  if (updates.length === 0) {
    return res.json({ log: db.prepare("SELECT * FROM daily_logs WHERE date = ?").get(req.params.date) });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.date);

  db.prepare(`UPDATE daily_logs SET ${updates.join(", ")} WHERE date = ?`).run(...params);
  res.json({ log: db.prepare("SELECT * FROM daily_logs WHERE date = ?").get(req.params.date) });
});

// POST /api/daily-log/:date/ai-plan — generate AI schedule for the day
router.post("/:date/ai-plan", async (req, res) => {
  const date = req.params.date;
  const log = getOrCreateLog(date);

  // Gather data
  const tasks = db.prepare(
    "SELECT * FROM tasks WHERE status != 'Done' ORDER BY position ASC"
  ).all().map(t => ({ ...t, tags: safeParseJSON(t.tags, []) }));

  const events = db.prepare(`
    SELECT * FROM calendar_events
    WHERE date(start_time) = date(?) ORDER BY start_time ASC
  `).all(date);

  try {
    const plan = await generateDayPlan({ date, tasks, events, morningNote: log.morning_note });
    const aiPlanStr = JSON.stringify(plan);

    db.prepare(`
      UPDATE daily_logs SET ai_plan = ?, updated_at = datetime('now') WHERE date = ?
    `).run(aiPlanStr, date);

    res.json({ plan, log: db.prepare("SELECT * FROM daily_logs WHERE date = ?").get(date) });
  } catch (err) {
    console.error("AI plan error:", err.message);
    res.status(502).json({ error: "AI planning failed", detail: err.message });
  }
});

// POST /api/daily-log/:date/ai-review — generate evening review
router.post("/:date/ai-review", async (req, res) => {
  const date = req.params.date;
  getOrCreateLog(date);

  const sessions = db.prepare(`
    SELECT fs.*, t.title as task_title
    FROM focus_sessions fs
    LEFT JOIN tasks t ON fs.task_id = t.id
    WHERE date(fs.started_at) = date(?) AND fs.ended_at IS NOT NULL
  `).all(date);

  const checkins = db.prepare(`
    SELECT * FROM accountability_checkins
    WHERE date(prompted_at) = date(?)
  `).all(date);

  const completedCount = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE status = 'Done' AND date(updated_at) = date(?)
  `).get(date).count;

  try {
    const review = await generateEveningReview({ date, sessions, checkins, completedCount });

    db.prepare(`
      UPDATE daily_logs SET ai_review = ?, updated_at = datetime('now') WHERE date = ?
    `).run(review, date);

    res.json({ review, log: db.prepare("SELECT * FROM daily_logs WHERE date = ?").get(date) });
  } catch (err) {
    console.error("Evening review error:", err.message);
    res.status(502).json({ error: "AI review failed", detail: err.message });
  }
});

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
