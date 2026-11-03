# ADR-0004: Self-update model (admin update control)

- Status: accepted
- Date: 2026-11-03
- Stakeholders: product owner, operator, admin

## Context

The operator wants to update a running StörDesk from the admin area: run the
GitHub update, redeploy, purge the old images and kill the PWA cache for a clean
update. The first ask named a Linux user password that must be typed before the
run.

Hard constraints from the codebase:

- The API runs in `node:22-alpine` as the unprivileged `node` user, `npm ci
  --omit=dev` (`Dockerfile`): no `git`, no `docker` CLI, no Docker socket, no
  host filesystem, no host user accounts.
- `PLAN.md` §4 and §15 keep `api` and `db` unpublished on the internal `backend`
  network with no host access; only `web` publishes a port.
- §15 and `AGENTS.md` _Data protection_: Argon2id for app users only, no secrets
  or plaintext credentials in logs/payloads/commits, CSRF and rate limits.
- The PWA has a service worker with a precached shell, a `sync-report`
  background-sync queue and a Dexie outbox (`apps/web/src/lib/outbox.ts`).
  §10: "load the new version in the background and show 'update available –
  reload'; never force a reload during input."
- Deployment of this instance is a **host checkout + `docker compose up -d
  --build`** (`docs/DEPLOYMENT.md` Quickstart), so "update" means git pull,
  rebuild and image prune — all host-level commands.

A container cannot pull, rebuild or prune the host that runs it, and it would be
rebuilding itself. A sudo/OS password collected in a web form is remote code
execution plus a plaintext high-privilege credential, and there is no host
account to authenticate to from inside the API image.

## Decision

Self-update is an **out-of-band host update agent**, never shell execution in the
API container, and it is delivered in stages. No OS password is ever collected.

- **API is a client only.** It authenticates with the normal session + a
  permission + CSRF, calls the agent over the internal network with a dedicated
  scoped bearer token, and reports the result. It never runs `git`, `docker`,
  `sudo` or a shell, and it never sees or stores an OS/Linux password.
- **Stage 1 — safe status + clean PWA update (this decision's shippable step,
  WP-M2-44).** A guarded `/admin/update` page shows the current application
  version and offers a clean client update: ask the service worker to check for a
  new version, on a new version skip waiting and reload, and an explicit
  "clear caches and reload". The action is disabled while the outbox still holds
  a queued or sending report (§10). No host access, no new permission key (reuse
  `settings.read`/`settings.write`), no new table.
- **Stage 2 — host update agent (planned, needs its own WP).** A small separate
  container mounted with the Docker socket, the repository checkout and its git
  credentials performs `git pull` → `docker compose up -d --build` → `docker
  image prune`. The API exposes guarded `POST /api/v1/admin/update/run` and a run
  history (a new `update_runs` table, modelled on `bma_sync_runs`), and reaches
  the agent with `UPDATE_AGENT_TOKEN`. A new permission key (e.g. `system.update`)
  is introduced only here.
- **Credentials.** `UPDATE_AGENT_TOKEN` is a random shared secret in `.env` only
  (pattern of `BMA_API_KEY`); never logged, never in a payload, never committed.
  `.env.example` ships an empty value.

## Alternatives

- **Type the Linux/sudo password, run commands from the API:** rejected — remote
  code execution, plaintext OS credential, no host account in the image, breaks
  §15. Not implementable and not allowed.
- **Exec git/docker inside the `api` container:** rejected — the image has no git
  or docker and no host access; it would rebuild the running container.
- **Arcane webhook / panel API:** rejected for now — this instance deploys from a
  host checkout, not Arcane; the agent model covers it and a panel integration
  can be added later without changing the API contract.
- **Watchtower-style image pull only:** rejected — the deployment model builds
  images from the checkout, it does not pull versioned images.
- **Force a cache wipe on every load:** rejected — it would drop an un-synced
  offline outbox (§10).

## Consequences

- New spec `specs/18-self-update.md` and this ADR; the hosting-model open
  decision of `PLAN.md` §19 is resolved for this instance.
- WP-M2-43 (this governance slice) and WP-M2-44 (stage-1 client update). Stage 2
  (agent container, `UPDATE_AGENT_TOKEN`, `update_runs` migration, `system.update`
  permission, guarded run route) stays planned and needs its own WP before code.
- The `api` image stays free of git/docker/host access; the privileged surface
  lives in a separate, explicitly trusted agent container.
