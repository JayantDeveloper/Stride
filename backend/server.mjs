import "dotenv/config";

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import cors from "cors";
import express from "express";

import {
  auth,
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
const plansRouter = require("./routes/plans");
const settingsRouter = require("./routes/settings");

const PORT = process.env.PORT || 5001;

const LOCAL_USER = { id: 'local-user', email: 'local@stride.app', name: 'Local User' };

async function requireAuth(req, res, next) {
  if (process.env.LOCAL_MODE === 'true') {
    req.user = LOCAL_USER;
    req.authSession = null;
    return next();
  }
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

  if (process.env.LOCAL_MODE === 'true') {
    // Seed user row so better-auth's account table FK works for Google Calendar linking
    await dbRun(`
      INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES ('local-user', 'Local User', 'local@stride.app', 1, datetime('now'), datetime('now'))
      ON CONFLICT (id) DO NOTHING
    `);

    // Seed a password credential so /api/local-session can call signInEmail
    // and return a properly signed better-auth session cookie for Google OAuth linking
    const { hashPassword } = await import('@better-auth/utils/password');
    const hash = await hashPassword('local-stride-passphrase');
    await dbRun(`
      INSERT INTO account (id, userId, providerId, accountId, password, createdAt, updatedAt)
      VALUES ('local-credential', 'local-user', 'credential', 'local@stride.app', ?, datetime('now'), datetime('now'))
      ON CONFLICT (id) DO UPDATE SET password = excluded.password, updatedAt = datetime('now')
    `, [hash]);
  }

  const app = express();

  // Stride's own UI plus any sibling local app allowed to push events in
  // (Forecast runs on :8090 and posts campus events to the calendar).
  // EXTRA_ORIGINS is a comma-separated list for anything else.
  const allowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://localhost:8090",
    ...(process.env.EXTRA_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean),
  ];

  app.use(
    cors({
      origin(origin, callback) {
        // No origin: same-origin requests, curl, server-to-server.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use("/api/auth", authHandler);
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true, mode: process.env.LOCAL_MODE === 'true' ? 'local' : 'auth' }));

  // Signs in local-user via better-auth and returns the signed session cookie
  // so /api/auth/link-social and /api/auth/list-accounts work for Google Calendar
  if (process.env.LOCAL_MODE === 'true') {
    app.post("/api/local-session", async (req, res) => {
      try {
        const result = await auth.api.signInEmail({
          body: { email: 'local@stride.app', password: 'local-stride-passphrase', rememberMe: true },
          returnHeaders: true,
        });
        const cookies = result?.headers?.getSetCookie?.() ?? [];
        if (cookies.length) res.setHeader('Set-Cookie', cookies);
        res.json({ ok: true });
      } catch (err) {
        console.error('local-session error:', err.message);
        res.status(500).json({ error: err.message });
      }
    });
  }

  app.use("/api/plans", requireAuth, plansRouter);
  app.use("/api/settings", requireAuth, settingsRouter);
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
