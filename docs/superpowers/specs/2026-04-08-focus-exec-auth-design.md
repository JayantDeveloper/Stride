# Focus Exec Multi-User Auth Design

Date: 2026-04-08
Status: Approved for planning

## Summary

`stride` will move from a single-user app with global data and a custom Google Calendar OAuth flow to a multi-user app with database-backed sessions, account creation, and tenant-scoped data.

The system will use Better Auth as the single auth system for:

- email/password signup and login
- Google sign-in
- database-backed session management
- linked Google account storage for Calendar access

The backend will be converted from CommonJS to ESM to support Better Auth cleanly in the existing Express server.

## Goals

- Let any user create an account and sign in with email/password or Google.
- Persist app sessions so users do not need to log in repeatedly.
- Persist Google Calendar linkage so users do not need to reconnect on every session.
- Scope all app data to the authenticated user and prevent cross-account data access.
- Keep Turso as the single database for auth and app data.
- Replace the current singleton Google credential model with per-user account linkage.

## Non-Goals

- Organizations, teams, or shared workspaces.
- Multiple independent Google identities linked to one app account in v1.
- A second auth vendor or second database dedicated to auth.
- A broad backend refactor unrelated to auth, tenancy, or the module migration.

## Current State

- The backend is CommonJS-based Express.
- `express-session` is only used for short-lived Google OAuth state.
- Product auth does not exist.
- Google Calendar connection is stored in a single global `google_credentials` row.
- App data tables are global and not scoped to a user.
- `app_settings` stores global state that should become user-specific.

This design changes the authority model completely: the authenticated app user becomes the root of access control for every route and every tenant-scoped query.

## Architectural Decisions

### 1. Better Auth is the single auth system

Better Auth will own:

- signup
- login
- logout
- session cookies
- linked social accounts
- Google OAuth account records

The existing custom auth routes in `backend/routes/auth.js` will be removed after migration.

### 2. Database-backed sessions

Sessions will be stored in Turso through Better Auth instead of using stateless JWT-only auth.

Reasons:

- immediate revocation on logout
- simpler debugging and admin inspection
- fewer failure modes than custom JWT handling
- good fit for the existing database-backed backend

### 3. Backend migrates to ESM

The current backend is CommonJS, while Better Auth's Express integration targets ESM. The backend will be migrated to ESM as part of this project.

This includes:

- `"type": "module"` in `backend/package.json`
- converting `require` and `module.exports` to `import` and `export`
- updating local module import paths and startup code

### 4. Google is both a login provider and a Calendar provider

Google will serve two related roles:

- social sign-in for product auth
- linked account used for Google Calendar API access

For v1, one `stride` account maps to one Google identity set.

Design constraints:

- `email/password + Google sign-in` is supported
- account linking is enabled
- trusted providers are `google` and `email-password`
- `allowDifferentEmails = false` for v1

Implication:

- if a user wants Google sign-in or Calendar connection, the linked Google identity must match the account identity set used for that app account
- users can still use the app without connecting Google Calendar

This is intentionally restrictive for v1 because it removes a large class of account-linking ambiguity and cross-identity support issues.

### 5. Calendar access uses incremental Google scopes

The app will request baseline Google auth for sign-in, then request Calendar scopes when the user explicitly connects Calendar.

This keeps signup lighter while still supporting durable Calendar linkage. Better Auth's Google provider will be configured to support refresh tokens using offline access and consent prompts.

## Runtime Architecture

### Auth endpoints

Better Auth will be mounted at `/api/auth/*`.

Express integration requirements:

- mount the Better Auth handler before `express.json()`
- keep other API routes under the same backend

### App routes

All non-auth app routes except health checks require an authenticated session.

Auth middleware behavior:

- resolve the Better Auth session from the request
- populate the request user context
- reject unauthenticated access

Critical rule:

- the client never sends `user_id`
- the backend derives the effective user from the session only

### Frontend session model

The frontend will boot with product session state, not Google OAuth status.

The UI will distinguish:

- signed in to the app
- not signed in
- signed in but Calendar not connected
- signed in and Calendar connected

The current `useGoogleAuth` flow will be replaced by:

- a product auth client/session layer
- a separate Calendar connection status layer

### Calendar connection behavior

When a signed-in user clicks Connect Calendar:

- if they already have Google linked with required Calendar scopes, no reconnect is needed
- if they have Google linked without Calendar scopes, the app triggers re-consent for additional scopes
- if they do not yet have Google linked, the flow links Google and requests Calendar scopes

The app only asks the user to reconnect when:

- Google revoked access
- scopes changed
- no refresh token is available

## Data Model

### Better Auth tables

Better Auth-managed tables will live in the same Turso database:

- `user`
- `session`
- `account`
- `verification`

Required config choices:

- database-backed sessions
- `account.encryptOAuthTokens = true`
- `account.updateAccountOnSignIn = true`
- `account.accountLinking.enabled = true`
- trusted providers: `google`, `email-password`

### Tenant-scoped app tables

Add `user_id TEXT NOT NULL REFERENCES user(id)` to:

- `tasks`
- `calendar_events`
- `focus_sessions`
- `accountability_checkins`
- `daily_logs`

Replace:

- `app_settings`

With:

- `user_settings`

`user_settings` shape:

- `user_id`
- `key`
- `value`
- primary key on `(user_id, key)`

Remove after migration:

- `google_credentials`

Google OAuth tokens and linked provider data will live in Better Auth `account` rows instead of a singleton table.

### Constraints and indexes

Required changes:

- add an index on `user_id` for every tenant-scoped table
- make `daily_logs` unique on `(user_id, date)`
- make calendar event uniqueness user-scoped instead of global

Required uniqueness for `calendar_events`:

- `(user_id, google_event_id)`

This prevents collisions between different users syncing the same provider event ids into the same database.

## Backend Query Rules

Every query against a tenant-scoped table must include `user_id`.

Examples:

Bad:

```sql
SELECT * FROM tasks WHERE id = ?
```

Good:

```sql
SELECT * FROM tasks WHERE id = ? AND user_id = ?
```

This rule applies to:

- `SELECT`
- `INSERT`
- `UPDATE`
- `DELETE`
- uniqueness checks
- background sync and derived queries

No route or service may rely on globally unique ownership assumptions after the migration.

## Migration Plan

### Phase 0: Backend and auth foundation

1. Convert backend to ESM.
2. Add Better Auth.
3. Stand up signup, login, logout, and session endpoints.
4. Add frontend auth UI and session bootstrap.

At this phase, auth exists, but tenant enforcement does not yet replace every data path.

### Phase 1: Schema expansion

1. Add Better Auth tables.
2. Add nullable `user_id` columns to all tenant-scoped app tables.
3. Add `user_settings` alongside existing `app_settings`.

### Phase 2: Owner account backfill

1. Create the first real account through the new auth flow.
2. Run a one-time migration script that assigns all existing rows to that user.
3. Copy relevant global settings into `user_settings` for that user.
4. Verify row counts before and after backfill.

This is safer than creating a fake unassigned tenant because it avoids long-lived legacy records with unclear ownership.

### Phase 3: Tenant enforcement

1. Make `user_id` non-null on tenant-scoped tables.
2. Add final user-scoped indexes and unique constraints.
3. Update every backend route and service to require authenticated user context.
4. Audit every data query to include `user_id`.

### Phase 4: Calendar integration cutover

1. Replace reads and writes from `google_credentials` with Better Auth account data.
2. Update Google Calendar service code to load account tokens for the authenticated user only.
3. Remove legacy custom auth routes and singleton credential logic.
4. Drop `google_credentials` after successful cutover verification.

## Security Requirements

### Tenant isolation

The main risk is a missing `user_id` predicate leading to insecure direct object reference behavior.

Required mitigation:

- every tenant-scoped route must derive user context from the authenticated session
- every tenant-scoped query must include `user_id`
- tests must verify cross-user access is denied

### Token protection

Google OAuth tokens must not be stored in plaintext custom tables. Better Auth account token encryption will be enabled.

### Session and cookie security

Use secure, httpOnly cookies in production and configure trusted origins correctly for:

- local development
- deployed frontend
- deployed backend

### OAuth reliability

Google provider configuration must request offline access and consent to maximize refresh-token reliability.

The UI must surface reconnect states when:

- access is revoked
- refresh fails
- required Calendar scopes are missing

## Error Handling

Expected user-visible states:

- unauthenticated: redirect to login or show auth gate
- authenticated without Calendar: show connect CTA
- Calendar token revoked: show reconnect CTA
- auth provider callback failure: show clear retry state
- forbidden cross-user resource access: return not found or forbidden, never leak ownership details

Expected backend behaviors:

- if a provider access token expires, refresh and retry where possible
- if refresh fails, mark the account as needing reconnect
- if session lookup fails, reject before touching tenant data

## Frontend Changes

Required UI changes:

- auth pages for signup and login
- Google sign-in option on auth screens
- session bootstrap on app load
- protected application shell
- settings UI updated to reflect product account and Calendar connection separately

State changes:

- replace `useGoogleAuth` with auth session hooks plus calendar connection hooks
- stop relying on URL query params from the legacy custom OAuth flow

## Testing Strategy

### Automated tests

Required test coverage:

- signup, login, logout, duplicate email, wrong password
- session-required route protection
- tenant isolation for read, update, delete, and list endpoints
- backfill migration correctness
- user-scoped uniqueness constraints
- Calendar linked-account presence and reconnect behavior

### Manual tests

Required manual verification:

- create account with email/password
- sign in with email/password
- sign in with Google
- connect Calendar once
- reload the app and confirm session persists
- reload the app and confirm Calendar remains connected
- verify one user's tasks do not appear when logged in as a second user

## Rollout Sequence

Recommended implementation order:

1. ESM backend migration
2. Better Auth server setup
3. frontend auth screens and session bootstrap
4. Google social sign-in
5. schema migration and owner backfill
6. tenant-scoped route and service audit
7. Calendar integration cutover
8. legacy auth removal

Do not start by rewriting every data route first. The auth and session foundation must exist before the tenant cutover is enforceable.

## Deferred Work

These items are explicitly out of scope for the first rollout:

- teams or shared workspaces
- support for linking a different Google identity than the app account identity
- admin consoles
- advanced anti-abuse tooling
- major unrelated data-access refactors

Email verification and password reset are not required to complete the first auth migration. If public signup abuse becomes a concern, add verification, rate limiting, and CAPTCHA as a follow-up hardening pass.

## Acceptance Criteria

This design is complete when all of the following are true:

- a new user can sign up with email/password
- a new or existing user can sign in with Google
- the app uses Better Auth sessions instead of the legacy custom auth flow
- all tenant-scoped tables are owned by a user
- all protected routes enforce authenticated user context
- existing single-user data is migrated into the first real account
- Google Calendar connection is stored per user, not globally
- a signed-in user does not need to reconnect Google every session
- one user's data is inaccessible to another user

## References

- Better Auth installation: https://better-auth.com/docs/installation
- Better Auth options: https://better-auth.com/docs/reference/options
- Better Auth SQLite adapter: https://better-auth.com/docs/adapters/sqlite
- Better Auth Google provider: https://better-auth.com/docs/authentication/google
- Better Auth OAuth concepts: https://better-auth.com/docs/concepts/oauth
