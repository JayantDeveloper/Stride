// routes/checkins.js — accountability check-ins after focus sessions

const express = require("express");
const crypto = require("crypto");
const { dbGet, dbAll, dbRun } = require("../db/database");

const router = express.Router();

// GET /api/checkins?date=YYYY-MM-DD
router.get("/", async (req, res) => {
  let query = "SELECT * FROM accountability_checkins";
  const params = [];

  if (req.query.date) {
    query += " WHERE date(prompted_at) = date(?)";
    params.push(req.query.date);
  }

  query += " ORDER BY prompted_at DESC";
  const checkins = await dbAll(query, params);
  res.json({ checkins });
});

// POST /api/checkins — create a check-in
router.post("/", async (req, res) => {
  const id = crypto.randomUUID();
  const checkin = {
    id,
    focus_session_id: req.body.focus_session_id ?? null,
    task_id: req.body.task_id ?? null,
    outcome: req.body.outcome ?? null,
    notes: req.body.notes ?? "",
    ai_followup: req.body.ai_followup ?? "",
    completed_at: req.body.outcome ? new Date().toISOString() : null,
  };

  await dbRun(`
    INSERT INTO accountability_checkins
      (id, focus_session_id, task_id, outcome, notes, ai_followup, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [checkin.id, checkin.focus_session_id, checkin.task_id, checkin.outcome,
      checkin.notes, checkin.ai_followup, checkin.completed_at]);

  const created = await dbGet("SELECT * FROM accountability_checkins WHERE id = ?", [id]);
  res.status(201).json({ checkin: created });
});

// PATCH /api/checkins/:id — submit outcome for an existing check-in
router.patch("/:id", async (req, res) => {
  const checkin = await dbGet("SELECT * FROM accountability_checkins WHERE id = ?", [req.params.id]);
  if (!checkin) return res.status(404).json({ error: "Check-in not found" });

  const updates = [];
  const params = [];

  if (req.body.outcome !== undefined) {
    updates.push("outcome = ?", "completed_at = datetime('now')");
    params.push(req.body.outcome);
  }
  if (req.body.notes !== undefined) { updates.push("notes = ?"); params.push(req.body.notes); }
  if (req.body.ai_followup !== undefined) { updates.push("ai_followup = ?"); params.push(req.body.ai_followup); }

  if (updates.length === 0) return res.json({ checkin });
  params.push(req.params.id);

  await dbRun(`UPDATE accountability_checkins SET ${updates.join(", ")} WHERE id = ?`, params);
  const updated = await dbGet("SELECT * FROM accountability_checkins WHERE id = ?", [req.params.id]);
  res.json({ checkin: updated });
});

module.exports = router;
