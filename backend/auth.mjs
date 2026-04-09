import { createRequire } from "node:module";

import { betterAuth } from "better-auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { Kysely, PostgresDialect } from "kysely";

const require = createRequire(import.meta.url);
const { getPool } = require("./db/postgres");
const { initializeAuthSchema } = require("./db/database");

const kyselyDb = new Kysely({
  dialect: new PostgresDialect({
    pool: getPool(),
  }),
});

const authDatabase = {
  db: kyselyDb,
  type: "postgres",
};

const isProduction = process.env.NODE_ENV === "production";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const backendUrl =
  process.env.BETTER_AUTH_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${process.env.PORT || 5001}`;
const authSecret =
  process.env.BETTER_AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  "better-auth-dev-secret-0123456789abcdef0123456789";
const trustedOrigins = [...new Set([frontendUrl, backendUrl].filter(Boolean))];

export const auth = betterAuth({
  baseURL: backendUrl,
  basePath: "/api/auth",
  secret: authSecret,
  database: authDatabase,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "missing-google-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "missing-google-client-secret",
      prompt: "consent",
      accessType: "offline",
    },
  },
  account: {
    encryptOAuthTokens: true,
    updateAccountOnSignIn: true,
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
      trustedProviders: ["google"],
    },
  },
  rateLimit: {
    enabled: false,
  },
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: isProduction
      ? { sameSite: "none" }
      : undefined,
  },
});

export const authHandler = toNodeHandler(auth);

export async function ensureAuthSchema() {
  await initializeAuthSchema();
}

export async function getSessionFromRequest(req) {
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
}

export async function getGoogleAccessToken(userId) {
  const token = await auth.api.getAccessToken({
    body: {
      providerId: "google",
      userId,
    },
  });

  return token?.accessToken ?? null;
}

export async function getGoogleAccountForUser(userId) {
  return kyselyDb
    .selectFrom("account")
    .selectAll()
    .where("userId", "=", userId)
    .where("providerId", "=", "google")
    .executeTakeFirst();
}

export async function hasGoogleCalendarConnection(userId) {
  const account = await getGoogleAccountForUser(userId);
  if (!account) return false;

  const scopes = String(account.scope || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return scopes.includes("https://www.googleapis.com/auth/calendar");
}
