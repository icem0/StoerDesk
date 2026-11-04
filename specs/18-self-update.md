# 18 — Update control (the update menu of the administration)

This slice expands the update decision of ADR-0004 and replaces the host update
agent of ADR-0006 with the deploy webhook of ADR-0007. It is authoritative for
the update control because it carries real content. `PLAN.md` §4/§15 (no host
access from `api`/`db`, secrets) and §10 (PWA update strategy) still win where
they are stricter.

Deployment assumption for this instance: **host checkout + `docker compose up -d
--build`** (`docs/DEPLOYMENT.md`). "Update" therefore means: the administration
sees that a newer commit exists upstream and hands the deployment to an external
tool — a deploy hook of a panel, a webhook of a container or a small script on
the host. The API never runs `git`, `docker` or a shell, and the deployment
itself is never part of the application.

## §18.1 Hard rules

- The `api` container never runs `git`, `docker`, `sudo` or any shell, and never
  receives, stores or forwards an OS/Linux/sudo password. The whole feature is
  built on that rule.
- Update triggers are authenticated like every other admin write: session cookie
  - CSRF + the permission guard `system.update`; errors are `{ code, params }`,
    never translated text and never a secret.
- The GitHub token and the deploy token belong to the API. They never reach the
  browser, a payload, a log line, a run row or the repository.
- The client of the PWA updates itself (`registerType: autoUpdate`); the update
  control of this slice is about the **stack**, not about the browser cache.

## §18.2 The update menu (web)

- The version badge of the shell header is the entry point: for a user with the
  permission `system.update` it is a **button** that opens a panel, for every
  other user it stays a plain text. The badge is visible on the login screen
  and on every guarded page (WP-M1-15, WP-M1-17).
- The panel shows: the installed version, the installed commit, the newest
  upstream commit, whether an update is available, the number of commits behind
  and the commits themselves (sha, message, date) — plus the button that starts
  the update.
- The panel reads `GET /api/v1/admin/update/check` and starts the update with
  `POST /api/v1/admin/update/start`. The button is disabled while the request
  runs and the panel states that the stack restarts itself and is briefly
  unreachable.
- A start is confirmed explicitly — a confirm step, never a password.
- The panel is hidden without the permission `system.update`; the guard of the
  server stays the only enforcement point (§3.2).
- All text through the `settings` namespace, keys `settings:admin.update.*`, de
  and en complete (`i18n:check`).

## §18.3 The check endpoint

`GET /api/v1/admin/update/check` (guard `system.update`) answers:

```json
{
  "current": "v0.0.42",
  "latest": "1a2b3c4",
  "updateAvailable": true,
  "commitsBehind": 3,
  "commits": [{ "sha": "1a2b3c4", "message": "fix(api): …", "date": "2026-11-04T10:00:00.000Z" }],
  "checkedAt": "2026-11-04T10:05:00.000Z"
}
```

- `current` is the installed version: the commit of the build (`GIT_COMMIT`) if
  the build carries one, otherwise the version of the tracked `VERSION` file of
  the image, `null` when neither is known.
- `latest` is the **short sha** of the newest commit of the branch.
  `commitsBehind` is the number of commits between the installed version and
  it, `null` when the two cannot be compared.
- `commits` lists the commits behind, newest first; `message` is the subject
  (the first line of the commit message), `date` the commit date in UTC.
- The API calls `https://api.github.com/repos/$GITHUB_REPO/commits/$GITHUB_BRANCH`
  and, when the installed version is known, additionally
  `https://api.github.com/repos/$GITHUB_REPO/compare/$current...$latest`.
- The answer is cached for 60 seconds, so the menu does not spam the GitHub
  API. A failed call is not cached.
- A failing call answers an error code — `update_not_configured`,
  `update_github_rate_limited`, `update_check_failed` — and never leaks a
  token. A compare that GitHub refuses (the installed version is not part of
  the upstream history) is not an error: the answer carries
  `commitsBehind: null`, so the menu says that the versions cannot be compared.

## §18.4 The start endpoint

`POST /api/v1/admin/update/start` (guard `system.update`):

- The server checks again whether an update is available (the cached answer is
  reused while it is younger than 60 seconds). Without an available update the
  route answers `409 update_no_update_available`.
- The server sends `POST $UPDATE_WEBHOOK_URL` with the header
  `X-Deploy-Token: $UPDATE_WEBHOOK_TOKEN` and a body it builds itself
  (`{ "version": …, "current": …, "requestedAt": … }`). **No value of the
  request reaches the webhook** — the client sends no parameters at all.
- The route answers `202 { "started": true }` immediately. It never waits for
  the end of the deployment: the target rebuilds the stack, so the API is gone
  while the deployment runs.
- **The webhook target answers immediately** and starts the deployment in the
  background. The API waits at most ten seconds for the answer; a target that
  deploys synchronously is answered with `502 update_webhook_failed`.
- **The answer can be lost.** The deployment replaces the API container, so the
  connection of the request may die before the `202` reaches the browser. The
  menu tells that case from a refused webhook: a lost connection means that
  the deployment has probably started, a refused webhook is an error of the
  configuration.
- A second start within five minutes is refused with `429 update_rate_limited`.
  The cooldown lives in the memory of the API process; the deployment restarts
  the API anyway, so a new window starts with it.
- A missing webhook answers `503 update_webhook_not_configured`, a refused
  webhook `502 update_webhook_failed`.

## §18.5 Configuration

| Variable               | Meaning                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `GITHUB_REPO`          | `owner/repo` of the upstream repository; empty disables the check.                                  |
| `GITHUB_BRANCH`        | the branch with the newest sources; default `main`.                                                 |
| `GITHUB_TOKEN`         | optional personal access token; it raises the rate limit, it never leaves the API.                  |
| `UPDATE_WEBHOOK_URL`   | the deploy hook the start triggers; empty disables the start.                                       |
| `UPDATE_WEBHOOK_TOKEN` | the value of the `X-Deploy-Token` header of the webhook.                                            |
| `GIT_COMMIT`           | build argument of the `api` image: the installed commit; `unknown` when the build does not know it. |

The compose file passes `GIT_COMMIT` as a build argument of the `api` service and
the variables above as its environment. `extra_hosts:
"host.docker.internal:host-gateway"` lets the webhook reach a deploy hook that
runs on the host of the stack.

## §18.6 Security

- No OS credential anywhere in UI, API, logs or commits (§18.1).
- The start is rate limited (five minutes) and requires an explicit confirmation
  in the UI (a confirm step, not a password).
- The GitHub token is sent as `Authorization: Bearer …` to `api.github.com` and
  nowhere else; the deploy token is sent as `X-Deploy-Token` to the configured
  webhook and nowhere else. Both are never logged, never answered and never
  committed.
- The webhook URL and the tokens are configuration of the operator; the menu
  never shows them.

## §18.7 The host update shell script (unchanged)

`scripts/update.sh` (also `npm run update:host`) updates a host without the API
and without a webhook target:

- `--check` compares the version of the running `api` container (`/app/VERSION` of its image) with the newest GitHub tag; without a running stack the answer is unknown and the update is built
  (`git ls-remote`, or the GitHub API when there is no checkout) and exits.
- Without `--check` it asks once (skipped with `--yes`), pulls a git work tree
  with `--ff-only --autostash`, otherwise sets the Git build context when
  `.env` has none and leaves the sources to the compose build, then runs
  `docker compose up -d --build --remove-orphans` for the running project.
- The compose project is read from `COMPOSE_PROJECT_NAME` or the running
  containers; running optional profiles such as `backup` stay enabled.
- **The image clean-up (WP-M3-02).** The rebuild moves the fixed `:latest` tags
  of `docker-compose.yml` to the new images, so the previous image of every
  built service turns tagless. The script snapshots the image ids it owns
  **before** the rebuild and afterwards removes by id every snapshotted image
  that is neither the current image of one of those names nor the image of a
  container of this compose project. `docker rmi` without `-f`: an image a
  container still holds stays.
- `docker image prune -a` and an unscoped `docker image prune -f` are never used:
  without a known project the name-based clean-up is the whole clean-up, so the
  images of other projects on a shared host stay untouched.
- `--cleanup` runs only the clean-up (no version check, no pull, no rebuild).
  `--gc` additionally prunes tagless images and the build cache older than
  `STOERDESK_GC_UNTIL` hours (default 168).
- The script needs `docker` and `sh`; `git`, `curl`/`wget` or `node` are used
  when present. It never writes a credential and never edits `.env`.
