import "dotenv/config";

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import cors from "cors";
import express from "express";

import {
  authHandler,
  ensureAuthSchema,
  getSessionFromRequest,
} from "./auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const {
  initializeSchema,
  dbGet,
  dbRun,
  claimLegacyDataForUser,
} = require("./db/database");

const tasksRouter = require("./routes/tasks");
const sessionsRouter = require("./routes/sessions");
const checkinsRouter = require("./routes/checkins");
const analyticsRouter = require("./routes/analytics");
const dailyLogRouter = require("./routes/dailylog");
const calendarRouter = require("./routes/calendar");
const aiRouter = require("./routes/ai");

const PORT = process.env.PORT || 5001;

async function requireAuth(req, res, next) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session?.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    await claimLegacyDataForUser(session.user.id);

    req.authSession = session.session;
    req.user = session.user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

export async function createApp() {
  await ensureAuthSchema();
  await initializeSchema();

  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
    }),
  );

  app.use("/api/auth", authHandler);
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.use("/api/tasks", requireAuth, tasksRouter);
  app.use("/api/sessions", requireAuth, sessionsRouter);
  app.use("/api/checkins", requireAuth, checkinsRouter);
  app.use("/api/analytics", requireAuth, analyticsRouter);
  app.use("/api/daily-log", requireAuth, dailyLogRouter);
  app.use("/api/calendar", requireAuth, calendarRouter);
  app.use("/api/ai", requireAuth, aiRouter);

  app.get("/api/pomodoro", requireAuth, async (req, res) => {
    const row = await dbGet(
      "SELECT value FROM user_settings WHERE user_id = ? AND key = 'pomodoro_state'",
      [req.user.id],
    );
    let state = row ? JSON.parse(row.value) : {};

    // Reset completedFocusSessions if it's a new day
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const lastResetDate = state.lastResetDate || today;

    if (lastResetDate !== today) {
      state.completedFocusSessions = 0;
      state.lastResetDate = today;

      // Save the updated state
      await dbRun(
        `
          INSERT INTO user_settings (user_id, key, value)
          VALUES (?, ?, ?)
          ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
        `,
        [req.user.id, "pomodoro_state", JSON.stringify(state)],
      );
    }

    res.json({ state });
  });

  app.put("/api/pomodoro", requireAuth, async (req, res) => {
    const state = { ...req.body, lastResetDate: new Date().toISOString().split('T')[0] };
    await dbRun(
      `
        INSERT INTO user_settings (user_id, key, value)
        VALUES (?, ?, ?)
        ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
      `,
      [req.user.id, "pomodoro_state", JSON.stringify(state)],
    );
    res.json({ ok: true });
  });

  return app;
}

export async function start() {
  const app = await createApp();
  return app.listen(PORT, "0.0.0.0", () => {
    console.log(`stride backend on http://localhost:${PORT}`);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
