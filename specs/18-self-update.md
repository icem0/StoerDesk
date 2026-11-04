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
  - CSRF + a permission guard; errors are `{ code, params }`, never translated
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

## §18.4 Stage 2 — host update agent (ADR-0006, optional for the in-UI button)

The default host update is the shell script of §18.7. The agent described here is
only needed when an administrator wants to start the update from the admin page.
The privileged part lives in a **separate, trusted container** on the host, never
in the `api` image. The topology is fixed by ADR-0006:

- Agent: a service `update-agent` of the **same compose project**, behind the
  compose profile `update`. A plain `docker compose up -d --build` skips a
  service whose profile is not enabled, so the agent is never recreated by the
  redeploy it triggers. It is started explicitly: `docker compose --profile
update up -d update-agent`.
- The start command the administration offers (WP-M3-03, corrected by WP-M3-04)
  runs **in the project folder of the stack** and pins that folder instead of
  discovering it: `-p <project>` from the `com.docker.compose.project` label of
  the running web container plus `--project-directory "$PWD"`. The
  `working_dir` label is not used — a panel runs compose inside its own
  container, so that label names a path inside the panel and changing into it
  fails on the host. The command also fills the two `.env` keys the compose file
  requires (`POSTGRES_PASSWORD`, `SESSION_SECRET`) from the environment of the
  running `api` container: only missing keys are appended, the file is created
  with `umask 077`, and no secret is ever carried over the host command line.
- Image: `node:22-alpine` plus `git`, `docker-cli` and `docker-cli-compose`
  (Alpine `main` / `community`); the agent code is bundled, no runtime npm
  dependencies.
- Mounts: the checkout read-write (relative `.`, so client and daemon share the
  absolute path), `/var/run/docker.sock` read-write, a small named volume for
  the agent's last-run state. **No published port** — the agent listens only on
  the internal `backend` network at `http://update-agent:8080`.
- Run steps, in this order:
  1. `git -c safe.directory=/repo pull --ff-only --autostash` — the repository
     is public, so no credential is needed; `GIT_TERMINAL_PROMPT=0` keeps it
     from blocking on a prompt. The owner of the checkout is recorded before
     and restored after the pull. When `/repo` is no git work tree (a panel
     such as Arcane syncs or builds the sources itself), the step is skipped
     instead of failing the run.
  2. `docker compose -p <project> --project-directory /repo -f
     /repo/docker-compose.yml up -d --build` — the rebuild of the whole running
     stack; the `api` container is recreated, so the request
     that triggered the run dies with it. The project is read from the agent's
     own `com.docker.compose.project` label, so a panel-specific project name
     is updated instead of a second stack being created. Profiles that are
     running now (e.g. `backup`) stay enabled; the `update` profile never is,
     because it contains the agent itself.
   3. `docker image prune -f --filter
label=com.docker.compose.project=<project>` — the dangling images of the
     previous build of this project. `docker image prune -a` is not used: it
     would delete the images of other projects on a shared host. This label
     filter alone misses the images of a build that never carried the label
     (remote build context, `docker-compose` v1, aborted build); the agent
     adopts the id-based clean-up of §18.7 in WP-M3-02b.
   4. Every step runs against `UPDATE_STEP_TIMEOUT_MS` (default ten minutes).
      A step that passes its deadline fails the run with `update_step_timeout`
      instead of blocking forever: the run reaches `finishedAt` and `lastRun`
      leaves `running`, so the administration no longer shows `Läuft` for a
      build that never comes back.
- The agent decides what a run is. It accepts no path, no command and no
  arguments from a request.
- A panel deployment builds from the Git URL (`IMAGE_BUILD_CONTEXT`,
  `docs/DEPLOYMENT.md`), because without a checkout there is nothing to pull;
  the compose build then fetches the new sources itself. The agent sets the Git
  URL when `.env` has none, so a synced project folder cannot rebuild the old
  files.
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

## §18.7 Host update shell script (default, no agent)

`scripts/update.sh` (also `npm run update:host`) updates a host without the API
and without the agent:

- `--check` compares the tracked `VERSION` with the newest GitHub tag
  (`git ls-remote`, or the GitHub API when there is no checkout) and exits.
- Without `--check` it asks once (skipped with `--yes`), pulls a git work tree
  with `--ff-only --autostash`, otherwise sets the Git build context when
  `.env` has none and leaves the sources to the compose build, then runs
  `docker compose up -d --build --remove-orphans` for the running project.
- The compose project is read from `COMPOSE_PROJECT_NAME` or the running
  containers; running optional profiles such as `backup` stay enabled and the
  `update` profile is never touched.
- **The image clean-up (WP-M3-02).** The rebuild moves the fixed `:latest` tags
  of `docker-compose.yml` to the new images, so the previous image of every
  built service turns tagless. A prune that only trusts the
  `com.docker.compose.project` **image** label misses them: that label is absent
  for a build from a remote build context (`IMAGE_BUILD_CONTEXT`), for the
  `docker-compose` v1 fallback and for an aborted build — and every one of those
  updates left a `<none>` image on the host. The script therefore snapshots the
  image ids it owns **before** the rebuild — the three `image:` names of
  `docker-compose.yml` (overridable with `STOERDESK_OWN_IMAGES`) plus the Compose
  default name patterns `<project>-*` and `<project>_*` — and afterwards removes
  by id every snapshotted image that is neither the current image of one of those
  names nor the image of a container of this compose project. `docker rmi`
  without `-f`: an image a container still holds stays. The project-labelled
  `docker image prune -f` stays as an additional best-effort step. The clean-up
  runs after a failed rebuild too, because that attempt already moved the tags.
- `docker image prune -a` and an unscoped `docker image prune -f` are never used:
  without a known project the name-based clean-up is the whole clean-up, so the
  images of other projects on a shared host stay untouched.
- `--cleanup` runs only the clean-up (no version check, no pull, no rebuild).
  `--gc` additionally prunes tagless images and the build cache older than
  `STOERDESK_GC_UNTIL` hours (default 168): `docker image prune -f` and
  `docker builder prune -f`, each with `--filter until=<n>h`. That is the opt-in
  way to clear the backlog an older version left behind, and on a shared host it
  also removes tagless images of other projects inside that window.
- The script needs `docker` and `sh`; `git`, `curl`/`wget` or `node` are used
  when present. It never writes a credential and never edits `.env`.
