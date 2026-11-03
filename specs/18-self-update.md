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

## §18.4 Stage 2 — host update agent (ADR-0006)

The privileged part lives in a **separate, trusted container** on the host, never
in the `api` image. The topology is fixed by ADR-0006:

- Agent: a service `update-agent` of the **same compose project**, behind the
  compose profile `update`. A plain `docker compose up -d --build` skips a
  service whose profile is not enabled, so the agent is never recreated by the
  redeploy it triggers. It is started explicitly: `docker compose --profile
  update up -d update-agent`.
- Image: `node:22-alpine` plus `git`, `docker-cli` and `docker-cli-compose`
  (Alpine `main` / `community`); the agent code is bundled, no runtime npm
  dependencies.
- Mounts: the checkout read-write (relative `.`, so client and daemon share the
  absolute path), `/var/run/docker.sock` read-write, a small named volume for
  the agent's last-run state. **No published port** — the agent listens only on
  the internal `backend` network at `http://update-agent:8080`.
- Run steps, in this order:
  1. `git -c safe.directory=/repo pull --ff-only` — the repository is public, so
     no credential is needed; `GIT_TERMINAL_PROMPT=0` keeps it from blocking on
     a prompt. The owner of the checkout is recorded before and restored after
     the pull.
  2. `docker compose --project-directory /repo -f /repo/docker-compose.yml up
     -d --build` — the rebuild of `api` and `web`; the `api` container is
     recreated, so the request that triggered the run dies with it.
  3. `docker image prune -f` — the dangling images of the previous local build.
     `docker image prune -a` is not used: it would delete the images of other
     projects on a shared host.
- The agent decides what a run is. It accepts no path, no command and no
  arguments from a request.
- API contract (guarded, new permission `system.update`):
  - `GET  /api/v1/admin/update/status` — agent reachable, current/known version.
  - `POST /api/v1/admin/update/run` — trigger one update; writes an
    `update_runs` row (modelled on `bma_sync_runs`): started, finished, status
    (`RUNNING`/`SUCCESS`/`PARTIAL`/`FAILED`), before/after version, error code.
  - `GET  /api/v1/admin/update/runs` — run history.
- The bearer of the agent is a random shared secret. The agent creates it itself
  and writes it into the state volume; the API reads it from there, so no
  secret has to be configured. `UPDATE_AGENT_TOKEN` in `.env` is optional and
  only pins a fixed bearer. The value is never logged, never in a payload or
  the run row, never committed.
- A run may restart the stack; the API must stay honest about its own
  interruption and the UI re-checks health after the run.

## §18.5 Security

- No OS credential anywhere in UI, API, logs, run rows or commits (§18.1).
- Update triggers are rate limited and require an explicit confirmation in the UI
  (a confirm step, not a password).
- The agent token is a random shared secret, rotated like any other `.env` value.
- The agent rejects a request without the bearer token with `401` and compares
  the token in constant time. It binds to the internal network only and answers
  no port on the host.

## §18.6 Agent contract

The agent speaks a small, fixed protocol on `http://update-agent:8080`:

- `GET /status` — `{ state, checkout: { version, commit? }, lastRun? }` where
  `state` is `idle`, `running` or `failed`.
- `POST /run` — starts one run; answers `202` with the run, `409` while a run is
  active.
- `GET /runs` — the runs the agent knows.

Every agent answer is validated by the API with the shared Zod schemas
(`packages/shared/src/schemas/update.ts`); a malformed answer is an error of the
API, never a crash.

Run state: the agent writes its last run to `/state/last-run.json` (the named
volume) and reloads it on start, so a restarted agent can still tell what
happened in the last run. The `update_runs` row of the API is the history the
UI shows; the API reconciles a `RUNNING` row with the agent's state after its
own restart and never invents a result the agent did not report.
