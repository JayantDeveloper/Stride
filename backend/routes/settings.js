// Small key/value store per user, over the existing user_settings table.
//
// Added for the Focus tab's daily lock: once you commit to a task for the day it has to
// stay committed when you reopen the app on your phone, so the lock cannot live in
// localStorage. Kept generic rather than a focus-specific endpoint — it is a key/value
// bag and the next small preference can reuse it.
const express = require("express");
const { dbGet, dbRun } = require("../db/database");

const router = express.Router();

// Keys are namespaced by the caller (e.g. "focus.lock.2026-09-06"). Constrained so a key
// cannot be used to smuggle anything odd into the row.
const KEY_RE = /^[A-Za-z0-9._:-]{1,120}$/;

router.get("/:key", async (req, res) => {
  const { key } = req.params;
  if (!KEY_RE.test(key)) return res.status(400).json({ error: "bad key" });
  const row = await dbGet(
    "SELECT value FROM user_settings WHERE user_id = ? AND key = ?",
    [req.user.id, key]
  );
  res.json({ key, value: row ? row.value : null });
});

router.put("/:key", async (req, res) => {
  const { key } = req.params;
  if (!KEY_RE.test(key)) return res.status(400).json({ error: "bad key" });
  const value = req.body?.value;
  if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });
  if (value.length > 4000) return res.status(400).json({ error: "value too large" });

  // Upsert. The table's primary key is (user_id, key).
  await dbRun(
    `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [req.user.id, key, value]
  );
  res.json({ key, value });
});

router.delete("/:key", async (req, res) => {
  const { key } = req.params;
  if (!KEY_RE.test(key)) return res.status(400).json({ error: "bad key" });
  await dbRun("DELETE FROM user_settings WHERE user_id = ? AND key = ?", [req.user.id, key]);
  res.json({ ok: true });
});

module.exports = router;
