# ADR-0007: Update check and deployment over a deploy webhook

- Status: accepted
- Date: 2026-11-04
- Stakeholders: product owner, operator, admin

## Context

ADR-0004 decided that the administration may trigger an update of the stack.
ADR-0006 implemented that trigger as a **host update agent**: a second container
of the same compose project, behind the profile `update`, with the Docker socket
mounted and `git` plus the Docker CLI inside the image. The API called the agent
over the internal network, the agent pulled the repository, rebuilt the stack and
pruned the old images.

That topology works, but it is heavy for a single-tenant installation and it
puts a second, privileged surface next to the application:

- the agent image needs `git`, `docker-cli` and `docker-cli-compose`, and the
  socket of the host — as privileged as the host itself;
- the agent belongs to a profile, so it is started explicitly and is *not* part
  of a normal `docker compose up -d --build`;
- the path of the checkout has to be discovered on the host, which differs per
  deployment panel (WP-M3-03, WP-M3-04);
- the administration page grew a guide with a host command, a token file, a
  state volume and a run history — the "update menu" of the product became the
  most complex page of the application;
- the client also fetched the tags of GitHub from the browser, so the check
  depended on the browser and could not name the installed version.

The operator of this instance already runs a deployment tool on the host (a
panel with a deploy hook, or a small script behind an HTTP endpoint). The
application does not have to know how a deployment is performed — it only has to
know *that* a newer version exists and *that* the operator wants it.

Facts that shape the design:

- The deployment model of this instance is a **host checkout + compose build**
  (`docs/DEPLOYMENT.md`), so the deployment is a host concern.
- The `api` container stays free of `git`, `docker`, `sudo` and a shell
  (ADR-0004, `specs/18-self-update.md` §18.1). That rule stays.
- The repository is public, so the GitHub API works without a credential; a
  token is optional and only raises the rate limit.
- Every commit of this repository carries an annotated version tag
  (`PLAN.md` §18.3), so the installed version of an image is known without git
  metadata in the build context (WP-M1-16).

## Decision

1. **The check lives in the API.** `GET /api/v1/admin/update/check` reads the
   newest commit of `GITHUB_BRANCH` from the GitHub API and, when the installed
   version is known, compares it with the installed one. The answer carries the
   installed version, the newest commit, the number of commits behind and the
   commits themselves; it is cached for 60 seconds.
2. **The installed version is the version of the image.** `GIT_COMMIT` is a build
   argument of the `api` image; when the build does not carry it, the tracked
   `VERSION` file of the image is the fallback. Both are valid base refs of the
   GitHub compare endpoint, so the installed version is always comparable.
3. **The trigger is a webhook, not a command.** `POST /api/v1/admin/update/start`
   sends `POST $UPDATE_WEBHOOK_URL` with the header `X-Deploy-Token:
   $UPDATE_WEBHOOK_TOKEN` and a body the API builds itself, and answers `202
   { "started": true }` immediately. The deployment target does the work; the
   API waits for nothing, because the deployment replaces the API container.
4. **The client sends no parameters.** The route ignores the request body, so
   no value of the browser can reach the webhook.
5. **A start is rate limited.** A second start within five minutes is refused
   with `429 update_rate_limited`; the cooldown lives in the memory of the API
   process, because the deployment restarts the API anyway.
6. **The menu is the version badge of the shell header.** For a user with the
   permission `system.update` it is a button that opens a panel with the
   installed version, the newest commit, the commits behind and the button that
   starts the update; every other user keeps the plain version text.
7. **The agent is retired.** The workspace `apps/agent`, the compose service
   `update-agent`, the `agent` target of the `Dockerfile`, the environment keys
   `UPDATE_AGENT_*` and the routes `/api/v1/admin/update/status|run|runs` are
   removed. The `update_runs` table stays as the history of the retired runs;
   nothing writes it any more.

## Alternatives

- **Keep the agent and add the webhook:** rejected — two privileged paths for
  one job, and the deployment would be reachable through two different
  mechanisms with two different histories.
- **The API runs `git pull` and `docker compose` itself:** rejected — ADR-0004
  and §18.1; the `api` image would need the Docker socket and a shell.
- **The browser calls the GitHub API directly (as the old page did):**
  rejected — the browser cannot name the installed version of the *server*, the
  rate limit of an anonymous request belongs to the user, and the check would
  keep working when the API is down.
- **The check compares version tags instead of commits:** rejected — the tags
  are the version of record, but the commits are what the operator wants to see
  before a deployment; the compare endpoint answers both.
- **The API waits for the end of the deployment:** rejected — the deployment
  replaces the API container, so the request would die with it.

## Consequences

- The update control is two read-only GitHub calls plus one HTTP call to the
  deployment target. No privileged container, no state volume, no host command
  in the administration.
- The operator configures the deployment target: `GITHUB_REPO`,
  `GITHUB_BRANCH`, `GITHUB_TOKEN` (optional), `UPDATE_WEBHOOK_URL` and
  `UPDATE_WEBHOOK_TOKEN`. The token never reaches the browser.
- The installation without a webhook can still check for updates; the start
  answers `503 update_webhook_not_configured`.
- The API no longer knows the outcome of a deployment — the target owns it.
  The `update_runs` table and the run history of the old page are gone from the
  administration.
- `scripts/update.sh` stays the manual path of the operator for a host without
  a deployment target (`specs/18-self-update.md` §18.7).
