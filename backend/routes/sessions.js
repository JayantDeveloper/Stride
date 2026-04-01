// routes/sessions.js — focus session tracking

const express = require("express");
const crypto = require("crypto");
const db = require("../db/database");

const router = express.Router();

// GET /api/sessions/active — must be before /:id to avoid route conflict
router.get("/active", (req, res) => {
  const session = db.prepare(
    "SELECT * FROM focus_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
  ).get();
  res.json({ session: session || null });
});

// GET /api/sessions?date=YYYY-MM-DD&task_id=...
router.get("/", (req, res) => {
  let query = "SELECT * FROM focus_sessions";
  const conditions = [];
  const params = [];

  if (req.query.date) {
    conditions.push("date(started_at) = date(?)");
    params.push(req.query.date);
  }
  if (req.query.task_id) {
    conditions.push("task_id = ?");
    params.push(req.query.task_id);
  }

  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY started_at DESC";

  const sessions = db.prepare(query).all(...params);
  res.json({ sessions });
});

// POST /api/sessions — start a session
router.post("/", (req, res) => {
  // End any currently active session first
  db.prepare(`
    UPDATE focus_sessions SET ended_at = datetime('now'), outcome = 'interrupted'
    WHERE ended_at IS NULL
  `).run();

  const id = crypto.randomUUID();
  const session = {
    id,
    task_id: req.body.task_id ?? null,
    started_at: new Date().toISOString(),
    planned_mins: req.body.planned_mins ?? 25,
    session_type: req.body.session_type ?? "focus",
  };

  db.prepare(`
    INSERT INTO focus_sessions (id, task_id, started_at, planned_mins, session_type)
    VALUES (@id, @task_id, @started_at, @planned_mins, @session_type)
  `).run(session);

  const created = db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(id);
  res.status(201).json({ session: created });
});

// PATCH /api/sessions/:id — end/update a session
router.patch("/:id", (req, res) => {
  const session = db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const updates = [];
  const params = [];

  if (req.body.ended_at !== undefined) { updates.push("ended_at = ?"); params.push(req.body.ended_at); }
  if (req.body.actual_mins !== undefined) { updates.push("actual_mins = ?"); params.push(req.body.actual_mins); }
  if (req.body.outcome !== undefined) { updates.push("outcome = ?"); params.push(req.body.outcome); }
  if (req.body.notes !== undefined) { updates.push("notes = ?"); params.push(req.body.notes); }

  // Auto-compute actual_mins if ended_at provided but actual_mins not
  if (req.body.ended_at && req.body.actual_mins === undefined) {
    const startMs = new Date(session.started_at).getTime();
    const endMs = new Date(req.body.ended_at).getTime();
    const mins = Math.round((endMs - startMs) / 60000);
    updates.push("actual_mins = ?");
    params.push(mins);
  }

  if (updates.length === 0) return res.json({ session });
  params.push(req.params.id);

  db.prepare(`UPDATE focus_sessions SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  const updated = db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(req.params.id);
  res.json({ session: updated });
});

module.exports = router;
