// routes/auth.js — Google OAuth2 flow

const express = require("express");
const crypto = require("crypto");
const db = require("../db/database");
const { getAuthUrl, handleCallback } = require("../services/googleCalendar");

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// GET /api/auth/google — initiate OAuth redirect
router.get("/google", (req, res) => {
  const state = crypto.randomUUID();
  req.session.oauthState = state;
  const url = getAuthUrl(state);
  res.redirect(url);
});

// GET /api/auth/google/callback
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("OAuth error:", error);
    return res.redirect(`${FRONTEND_URL}/settings?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/settings?error=missing_code`);
  }

  // Validate state to prevent CSRF (skip if session middleware not set up)
  if (req.session.oauthState && req.session.oauthState !== state) {
    return res.redirect(`${FRONTEND_URL}/settings?error=invalid_state`);
  }

  try {
    const { email } = await handleCallback(code);
    req.session.oauthState = null;
    res.redirect(`${FRONTEND_URL}/settings?connected=true&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    res.redirect(`${FRONTEND_URL}/settings?error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/auth/status
router.get("/status", (req, res) => {
  const creds = db.prepare("SELECT id, email, updated_at FROM google_credentials WHERE id = 1").get();
  res.json({
    connected: !!(creds?.email),
    email: creds?.email ?? null,
  });
});

// DELETE /api/auth/google — disconnect
router.delete("/google", (req, res) => {
  db.prepare("DELETE FROM google_credentials WHERE id = 1").run();
  res.json({ ok: true });
});

module.exports = router;
