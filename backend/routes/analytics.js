// routes/analytics.js — productivity stats

const express = require("express");
const { dbGet, dbAll } = require("../db/database");

const router = express.Router();

// GET /api/analytics/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get("/summary", async (req, res) => {
  const start = req.query.start ?? sevenDaysAgo();
  const end = req.query.end ?? today();

  const [completedTasks, totalTasks, sessions, checkinOutcomes, dailyTasks, dailyFocus] = await Promise.all([
    dbGet(`
      SELECT COUNT(*) as count FROM tasks
      WHERE status = 'Done' AND date(updated_at) BETWEEN date(?) AND date(?)
    `, [start, end]),
    dbGet("SELECT COUNT(*) as count FROM tasks"),
    dbGet(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(COALESCE(actual_mins, planned_mins)) as total_focus_mins,
        SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(CASE WHEN outcome = 'interrupted' THEN 1 ELSE 0 END) as interrupted_sessions
      FROM focus_sessions
      WHERE session_type = 'focus'
        AND date(started_at) BETWEEN date(?) AND date(?)
        AND ended_at IS NOT NULL
    `, [start, end]),
    dbAll(`
      SELECT outcome, COUNT(*) as count
      FROM accountability_checkins
      WHERE date(prompted_at) BETWEEN date(?) AND date(?)
        AND outcome IS NOT NULL
      GROUP BY outcome
    `, [start, end]),
    dbAll(`
      SELECT date(updated_at) as date, COUNT(*) as completed
      FROM tasks
      WHERE status = 'Done' AND date(updated_at) BETWEEN date(?) AND date(?)
      GROUP BY date(updated_at)
      ORDER BY date ASC
    `, [start, end]),
    dbAll(`
      SELECT date(started_at) as date,
             SUM(COALESCE(actual_mins, planned_mins)) as focus_mins,
             COUNT(*) as sessions
      FROM focus_sessions
      WHERE session_type = 'focus'
        AND ended_at IS NOT NULL
        AND date(started_at) BETWEEN date(?) AND date(?)
      GROUP BY date(started_at)
      ORDER BY date ASC
    `, [start, end]),
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
  const start = sevenDaysAgo();
  const end = today();

  const rows = await dbAll(`
    SELECT
      d.date,
      COALESCE(t.completed, 0) as tasks_completed,
      COALESCE(f.focus_mins, 0) as focus_mins,
      COALESCE(f.sessions, 0) as sessions
    FROM (
      WITH RECURSIVE dates(date) AS (
        SELECT date(?)
        UNION ALL
        SELECT date(date, '+1 day') FROM dates WHERE date < date(?)
      ) SELECT date FROM dates
    ) d
    LEFT JOIN (
      SELECT date(updated_at) as date, COUNT(*) as completed
      FROM tasks WHERE status = 'Done'
      GROUP BY date(updated_at)
    ) t ON d.date = t.date
    LEFT JOIN (
      SELECT date(started_at) as date,
             SUM(COALESCE(actual_mins, planned_mins)) as focus_mins,
             COUNT(*) as sessions
      FROM focus_sessions
      WHERE session_type = 'focus' AND ended_at IS NOT NULL
      GROUP BY date(started_at)
    ) f ON d.date = f.date
    ORDER BY d.date ASC
  `, [start, end]);

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
