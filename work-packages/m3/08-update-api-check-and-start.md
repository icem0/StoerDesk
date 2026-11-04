# WP-M3-08: the update API — check and start

format: small-model
status: planned
depends-on: WP-M3-07
phase: 3
milestone: m3
context-budget: 20k tokens
spec: specs/18-self-update.md §18.3, §18.4, §18.5
spec-lines: 70

files-read:

- apps/api/src/update/routes.ts — the routes of the retired agent
- apps/api/src/update/github.ts — the client of WP-M3-07
- apps/api/src/config/env.ts — the environment schema
- apps/api/src/auth/requirePermission.ts — the guard of an admin write
- apps/api/src/update/__tests__/routes.integration.spec.ts — the old route test
- specs/18-self-update.md (§18.3–§18.5)

files-write:

- apps/api/src/update/routes.ts
- apps/api/src/update/installed-version.ts
- apps/api/src/config/env.ts
- apps/api/src/update/__tests__/routes.integration.spec.ts

interfaces:

- `GET /api/v1/admin/update/check` — `{ current, latest, updateAvailable, commitsBehind, commits, checkedAt }`
- `POST /api/v1/admin/update/start` — `202 { started: true }`
- `resolveInstalledVersion(env): string | null` — `GIT_COMMIT`, else the
  `VERSION` file of the image
- `UPDATE_CHECK_CACHE_MS` — 60 000 ms
- `UPDATE_START_COOLDOWN_MS` — 300 000 ms

## Task

1. Add the environment keys of §18.5 to `apps/api/src/config/env.ts`
   (`GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_TOKEN`, `UPDATE_WEBHOOK_URL`,
   `UPDATE_WEBHOOK_TOKEN`, `GIT_COMMIT`, `VERSION_FILE`) and remove the keys of
   the retired agent (`UPDATE_AGENT_URL`, `UPDATE_AGENT_TOKEN`,
   `UPDATE_AGENT_TOKEN_FILE`).
2. Add `apps/api/src/update/installed-version.ts`: the installed version is the
   commit of the build (`GIT_COMMIT`), otherwise the version of the tracked
   `VERSION` file of the image; `null` when neither is known.
3. Rewrite `apps/api/src/update/routes.ts`:
   - `GET /api/v1/admin/update/check` (guard `system.update`) reads the newest
     commit of the branch and compares it with the installed version; the
     answer is cached for 60 seconds, a failure is not cached and answers
     `{ code, params }`.
   - `POST /api/v1/admin/update/start` (guard `system.update`) checks again
     whether an update is available, sends `POST $UPDATE_WEBHOOK_URL` with the
     header `X-Deploy-Token` and a body it builds itself, and answers
     `202 { started: true }` immediately. A second start within five minutes is
     refused with `429 update_rate_limited`.
4. Delete the client of the retired agent (`apps/api/src/update/client.ts`) and
   its test; the routes of the agent are gone with them.
5. Rewrite the route test: the guard, the cached answer, the compare that
   cannot be answered, the webhook call with its header, the cooldown and the
   error codes.

## Non-goals

- No new permission key: `system.update` exists (WP-M2-49).
- No row in the database: the cooldown lives in the memory of the process.
- No client parameter reaches the webhook; the route ignores the body.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/api
npm run test:run -w @stoerdesk/api
npm run check
```

Expected: all green; the route test proves the answers, the cache, the
cooldown and the error codes.

## Handoff

- Files changed: the routes, the installed version, the environment, the route
  test
- Interfaces added: the two routes, `resolveInstalledVersion`
- Verified: pending
- Follow-up WP: WP-M3-09 (the deployment configuration), WP-M3-10 (the menu)
- Open question: none
