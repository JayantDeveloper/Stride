require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { initializeSchema, dbGet, dbRun } = require("./db/database");

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
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 10 * 60 * 1000 },
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

// Legacy pomodoro endpoint
app.get("/api/pomodoro", async (req, res) => {
  const row = await dbGet("SELECT value FROM app_settings WHERE key = 'pomodoro_state'");
  const state = row ? JSON.parse(row.value) : {};
  res.json({ state });
});

app.put("/api/pomodoro", async (req, res) => {
  await dbRun(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
    ["pomodoro_state", JSON.stringify(req.body)]
  );
  res.json({ ok: true });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  await initializeSchema();
  app.listen(PORT, "0.0.0.0", () => console.log(`focus-exec backend on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
