require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 10 * 60 * 1000 }, // 10 min — only for OAuth state
}));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/api/tasks",      require("./routes/tasks"));
app.use("/api/sessions",   require("./routes/sessions"));
app.use("/api/checkins",   require("./routes/checkins"));
app.use("/api/analytics",  require("./routes/analytics"));
app.use("/api/daily-log",  require("./routes/dailylog"));
app.use("/api/calendar",   require("./routes/calendar"));
app.use("/api/auth",       require("./routes/auth"));
app.use("/api/ai",         require("./routes/ai"));

// Legacy pomodoro endpoint — reads/writes to app_settings for backward compat
const db = require("./db/database");

app.get("/api/pomodoro", (req, res) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'pomodoro_state'").get();
  const state = row ? JSON.parse(row.value) : {};
  res.json({ state });
});

app.put("/api/pomodoro", (req, res) => {
  db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pomodoro_state', ?)
  `).run(JSON.stringify(req.body));
  res.json({ ok: true });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`focus-exec backend on http://localhost:${PORT}`));
