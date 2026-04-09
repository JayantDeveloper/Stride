// routes/sessions.js — focus session tracking

const express = require("express");
const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");

const router = express.Router();

// GET /api/sessions/active — must be before /:id to avoid route conflict
router.get("/active", async (req, res) => {
  const session = await dbGet(
    "SELECT * FROM focus_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    [req.user.id]
  );
  res.json({ session: session || null });
});

// GET /api/sessions?date=YYYY-MM-DD&task_id=...
router.get("/", async (req, res) => {
  let query = "SELECT * FROM focus_sessions WHERE user_id = ?";
  const conditions = [];
  const params = [req.user.id];

  if (req.query.date) {
    conditions.push("date(started_at) = date(?)");
    params.push(req.query.date);
  }
  if (req.query.task_id) {
    conditions.push("task_id = ?");
    params.push(req.query.task_id);
  }

  if (conditions.length) query += " AND " + conditions.join(" AND ");
  query += " ORDER BY started_at DESC";

  const sessions = await dbAll(query, params);
  res.json({ sessions });
});

// POST /api/sessions — start a session
router.post("/", async (req, res) => {
  await dbRun(`
    UPDATE focus_sessions SET ended_at = CURRENT_TIMESTAMP, outcome = 'interrupted'
    WHERE ended_at IS NULL AND user_id = ?
  `, [req.user.id]);

  const id = crypto.randomUUID();
  const session = {
    id,
    user_id: req.user.id,
    task_id: req.body.task_id ?? null,
    started_at: new Date().toISOString(),
    planned_mins: req.body.planned_mins ?? 25,
    session_type: req.body.session_type ?? "focus",
  };

  await dbRun(`
    INSERT INTO focus_sessions (id, user_id, task_id, started_at, planned_mins, session_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [session.id, session.user_id, session.task_id, session.started_at, session.planned_mins, session.session_type]);

  const created = await dbGet("SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?", [id, req.user.id]);
  res.status(201).json({ session: created });
});

// PATCH /api/sessions/:id — end/update a session
router.patch("/:id", async (req, res) => {
  const session = await dbGet(
    "SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?",
    [req.params.id, req.user.id]
  );
  if (!session) return res.status(404).json({ error: "Session not found" });

  const updates = [];
  const params = [];

  if (req.body.ended_at !== undefined) { updates.push("ended_at = ?"); params.push(req.body.ended_at); }
  if (req.body.actual_mins !== undefined) { updates.push("actual_mins = ?"); params.push(req.body.actual_mins); }
  if (req.body.outcome !== undefined) { updates.push("outcome = ?"); params.push(req.body.outcome); }
  if (req.body.notes !== undefined) { updates.push("notes = ?"); params.push(req.body.notes); }

  if (req.body.ended_at && req.body.actual_mins === undefined) {
    const startMs = new Date(session.started_at).getTime();
    const endMs = new Date(req.body.ended_at).getTime();
    const mins = Math.round((endMs - startMs) / 60000);
    updates.push("actual_mins = ?");
    params.push(mins);
  }

  if (updates.length === 0) return res.json({ session });
  params.push(req.params.id, req.user.id);

  await dbRun(`UPDATE focus_sessions SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`, params);
  const updated = await dbGet(
    "SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?",
    [req.params.id, req.user.id]
  );
  res.json({ session: updated });
});

module.exports = router;
