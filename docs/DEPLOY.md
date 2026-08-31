# Deploying Stride (so it works on the phone)

Target shape:

```
iPhone ──https──> Vercel (frontend PWA + /api proxy)
                       │
                       └──> Render (stride-backend)
                                  │
                                  └──> Neon Postgres
```

The Mac is not involved. Everything below is one-time except step 5.

---

## 0. Prerequisites

- Neon account and a connection string (`postgresql://…?sslmode=require`)
- `render` API key and `vercel` CLI — both already configured on this machine
- Google Cloud project holding the existing OAuth client

## 1. Migrate the data

```bash
node scripts/migrate-to-postgres.mjs --dry-run 'postgresql://…'   # look first
node scripts/migrate-to-postgres.mjs 'postgresql://…'
```

Creates the schema via the app's own `initializeSchema()`, copies all 12 tables in
FK-safe order, then re-counts both sides and exits non-zero if anything is short.
Re-runnable — inserts are `ON CONFLICT DO NOTHING`. It never deletes.

## 2. Deploy the backend to Render

`render.yaml` already declares the service. Env vars to set:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Neon string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from `backend/.env` |
| `GOOGLE_REDIRECT_URI` | `https://<render-host>/api/auth/callback/google` |
| `BETTER_AUTH_SECRET` | a fresh 32-byte random value, NOT the local one |
| `FRONTEND_URL` | the Vercel production URL |
| `OPENAI_API_KEY` | from `backend/.env` |
| `GOOGLE_CALENDAR_TIMEZONE` | `America/New_York` |

`BETTER_AUTH_URL` can be omitted: `auth.mjs` falls back to `RENDER_EXTERNAL_URL`,
which Render injects automatically.

**Do not set `LOCAL_MODE`.** Its absence is what selects the Postgres driver.

## 3. Point Google OAuth at the new callback

In Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 client:

- **Authorised redirect URIs** — add `https://<render-host>/api/auth/callback/google`
- **Authorised JavaScript origins** — add the Vercel origin

This is Console-only; there is no `gcloud` command for editing an OAuth client's
redirect URIs. Keep the localhost entries so local dev keeps working.

## 4. Deploy the frontend to Vercel

Edit `frontend/vercel.json` and replace `__BACKEND_URL__` with the Render URL, then:

```bash
cd frontend && vercel --prod
```

Leave `VITE_API_URL` **unset**. `apiClient.js` then issues relative `/api/...` requests,
which the Vercel rewrite proxies to Render — so the browser sees a single origin and the
auth cookie stays first-party. Setting `VITE_API_URL` to the Render host would make it a
third-party cookie, which iOS Safari blocks; in an installed PWA that shows up as being
logged out constantly.

## 5. Install it on the iPhone

Safari → the Vercel URL → Share → **Add to Home Screen**.

It launches standalone (no browser chrome), uses the purple icon, and the app shell is
cached so it opens instantly. Data is always fetched live — the service worker
deliberately never caches `/api/*`, because a stale task list is worse than a slow one.

---

## Gotchas worth remembering

- **Render free tier cold-starts.** After ~15 minutes idle the first request takes ~50s.
  For a phone app you open a few times a day that is felt every time. ~$7/mo removes it.
- **`db/database.js` must dispatch on `LOCAL_MODE`.** It was once hardcoded to
  `require("./sqlite")` (commit 5906931), which meant auth used Postgres while task and
  calendar data went to a local SQLite file — wiped on every Render restart. If tasks ever
  vanish after a deploy, look here first.
- **Sessions do not survive the move.** `BETTER_AUTH_SECRET` differs from local, so the
  188 migrated session rows are inert. Expect to sign in once on the phone.
- **Neon autosuspends when idle** and resumes in about a second. Harmless, but it means
  the very first query after a quiet period is slightly slow on top of any Render cold start.

---

## Why the API is proxied through Vercel rather than called directly

`frontend/vercel.json` rewrites `/api/*` to the Render backend instead of the frontend
calling `https://stride-backend.onrender.com` directly. That is deliberate.

better-auth keeps the session in a cookie. If the browser talks to a different origin than
the page it is on, that cookie is **third-party**, and iOS Safari's tracking prevention
blocks third-party cookies by default. In an installed PWA the symptom is being signed out
on almost every launch, which is maddening to debug because it works fine on desktop Chrome.

Routing through Vercel means the browser only ever sees one origin, the cookie stays
first-party, and CORS never enters the picture. The cost is one extra network hop.

Note that `vercel.json` permits **no comments and no unknown keys** — Vercel validates the
file strictly and fails the build on an unrecognised property. Keep explanations here.
