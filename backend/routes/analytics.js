// routes/analytics.js — productivity stats

const express = require("express");
const { dbGet, dbAll } = require("../db/database");

const router = express.Router();

// GET /api/analytics/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get("/summary", async (req, res) => {
  const userId = req.user.id;
  const start = req.query.start ?? sevenDaysAgo();
  const end = req.query.end ?? today();

  const [completedTasks, totalTasks, sessions, checkinOutcomes, dailyTasks, dailyFocus] = await Promise.all([
    dbGet(`
      SELECT COUNT(*) as count FROM tasks
      WHERE user_id = ?
        AND status = 'Done'
        AND updated_at::date BETWEEN ?::date AND ?::date
    `, [userId, start, end]),
    dbGet("SELECT COUNT(*) as count FROM tasks WHERE user_id = ?", [userId]),
    dbGet(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(COALESCE(actual_mins, planned_mins)) as total_focus_mins,
        SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(CASE WHEN outcome = 'interrupted' THEN 1 ELSE 0 END) as interrupted_sessions
      FROM focus_sessions
      WHERE user_id = ?
        AND session_type = 'focus'
        AND started_at::date BETWEEN ?::date AND ?::date
        AND ended_at IS NOT NULL
    `, [userId, start, end]),
    dbAll(`
      SELECT outcome, COUNT(*) as count
      FROM accountability_checkins
      WHERE user_id = ?
        AND prompted_at::date BETWEEN ?::date AND ?::date
        AND outcome IS NOT NULL
      GROUP BY outcome
    `, [userId, start, end]),
    dbAll(`
      SELECT updated_at::date as date, COUNT(*) as completed
      FROM tasks
      WHERE user_id = ?
        AND status = 'Done'
        AND updated_at::date BETWEEN ?::date AND ?::date
      GROUP BY updated_at::date
      ORDER BY date ASC
    `, [userId, start, end]),
    dbAll(`
      SELECT started_at::date as date,
             SUM(COALESCE(actual_mins, planned_mins)) as focus_mins,
             COUNT(*) as sessions
      FROM focus_sessions
      WHERE user_id = ?
        AND session_type = 'focus'
        AND ended_at IS NOT NULL
        AND started_at::date BETWEEN ?::date AND ?::date
      GROUP BY started_at::date
      ORDER BY date ASC
    `, [userId, start, end]),
  ]);

  const outcomeCounts = {};
  for (const row of checkinOutcomes) outcomeCounts[row.outcome] = row.count;

  res.json({
    range: { start, end },
    tasks: {
      completed: completedTasks.count,
      total: totalTasks.count,
    },
    focus: {
      total_sessions: sessions.total_sessions ?? 0,
      total_focus_mins: sessions.total_focus_mins ?? 0,
      completed_sessions: sessions.completed_sessions ?? 0,
      interrupted_sessions: sessions.interrupted_sessions ?? 0,
    },
    checkin_outcomes: outcomeCounts,
    daily_tasks: dailyTasks,
    daily_focus: dailyFocus,
  });
});

// GET /api/analytics/trends — last 7 days, one row per day
router.get("/trends", async (req, res) => {
  const userId = req.user.id;
  const start = sevenDaysAgo();
  const end = today();

  const rows = await dbAll(`
    SELECT
      d.date::text,
      COALESCE(t.completed, 0) as tasks_completed,
      COALESCE(f.focus_mins, 0) as focus_mins,
      COALESCE(f.sessions, 0) as sessions
    FROM (
      SELECT generate_series(?::date, ?::date, INTERVAL '1 day')::date AS date
    ) d
    LEFT JOIN (
      SELECT updated_at::date as date, COUNT(*) as completed
      FROM tasks
      WHERE user_id = ? AND status = 'Done'
      GROUP BY updated_at::date
    ) t ON d.date = t.date
    LEFT JOIN (
      SELECT started_at::date as date,
             SUM(COALESCE(actual_mins, planned_mins)) as focus_mins,
             COUNT(*) as sessions
      FROM focus_sessions
      WHERE user_id = ?
        AND session_type = 'focus'
        AND ended_at IS NOT NULL
      GROUP BY started_at::date
    ) f ON d.date = f.date
    ORDER BY d.date ASC
  `, [start, end, userId, userId]);

  res.json({ trends: rows });
});

function today() {
  return new Date().toISOString().split("T")[0];
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().split("T")[0];
}

module.exports = router;
