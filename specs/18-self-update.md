# 18 — Self-update (admin update control)

This slice expands the self-update decision (ADR-0004). It is authoritative for
the update control because it carries real content. `PLAN.md` §4/§15 (no host
access from `api`/`db`, secrets) and §10 (PWA update strategy, never force a
reload during input) still win where they are stricter.

Deployment assumption for this instance: **host checkout + `docker compose up -d
--build`** (`docs/DEPLOYMENT.md` Quickstart). "Update" therefore means
`git pull` → rebuild → image prune on the host — never inside the `api` image.

## §18.1 Hard rules

- The `api` container never runs `git`, `docker`, `sudo` or any shell, and never
  receives, stores or forwards an OS/Linux/sudo password. The whole feature is
  built on that rule.
- Update triggers are authenticated like every other admin write: session cookie
  + CSRF + a permission guard; errors are `{ code, params }`, never translated
  text and never a secret.
- The PWA clean update must not destroy unsent offline reports. While the Dexie
  outbox (`apps/web/src/lib/outbox.ts`) holds a row with status `queued` or
  `sending`, a forced cache clear / reload is blocked (§10).

## §18.2 Stage 1 — safe status + clean PWA update (WP-M2-44)

Client-only. No API call, no host access, no new permission key, no new table.

- Guarded page `/admin/update` (inside `RequireSession`), reachable from the
  administration home as the module `update`.
- Shows the current application version from `appVersion` (`lib/version.ts`) and
  the version string of the active service worker when available.
- **Update check + reload:** asks the registration for the active/updated
  service worker, and when an update is waiting calls `skipWaiting` and reloads.
  When `registerType: autoUpdate` already replaced the worker, the page still
  offers a manual reload.
- **Clean update / clear cache:** sends the service worker a message to unregister
  itself and delete every `caches` entry, then reloads the page.
- **Outbox guard:** the reload/clear controls are disabled and explained while a
  report is queued or sending. Re-enabling is automatic when the outbox drains.
- All text through the `settings` namespace, keys `settings:admin.update.*`, de
  and en complete (`i18n:check`).

Out of scope for stage 1: any host command, any "run the update" button, the
agent, `UPDATE_AGENT_TOKEN`, the `update_runs` table and a new permission.

## §18.3 Update availability (optional, planned)

A read-only "is a newer version upstream?" signal may be added later as its own
WP: `GET /api/v1/admin/update/status` returning
`{ currentVersion?, latestVersion?, updateAvailable, checkedAt }` from a
read-only GitHub tag/commit call (pattern of `apps/api/src/integrations/
bmacloud/client.ts`), guarded by `settings.read`. The current version is a
build-time web value (`__APP_VERSION__`); the API runtime does not read `VERSION`
(WP-M1-16), so the client sends its version or the comparison runs client-side.
A failing upstream call answers `{ code }` and never leaks a token. Not required
for stage 1.

## §18.4 Stage 2 — host update agent (planned, needs its own WP)

The privileged part lives in a **separate, trusted container** on the host, never
in the `api` image.

- Agent: a small container mounted with the Docker socket, the repository
  checkout and its git credentials. It performs `git pull` →
  `docker compose up -d --build` → `docker image prune`. It listens only on the
  internal network and requires the bearer `UPDATE_AGENT_TOKEN`.
- API contract (guarded, new permission e.g. `system.update`):
  - `GET  /api/v1/admin/update/status` — agent reachable, current/known version.
  - `POST /api/v1/admin/update/run` — trigger one update; writes an
    `update_runs` row (modelled on `bma_sync_runs`): started, finished, status
    (`RUNNING`/`SUCCESS`/`PARTIAL`/`FAILED`), before/after version, error code.
  - `GET  /api/v1/admin/update/runs` — run history.
- `UPDATE_AGENT_TOKEN` lives in `.env` only; never logged, never in a payload or
  the run row, never committed. `.env.example` ships an empty value.
- A run may restart the stack; the API must stay honest about its own
  interruption and the UI re-checks health after the run.

## §18.5 Security

- No OS credential anywhere in UI, API, logs, run rows or commits (§18.1).
- Update triggers are rate limited and require an explicit confirmation in the UI
  (a confirm step, not a password).
- The agent token is a random shared secret, rotated like any other `.env` value.
