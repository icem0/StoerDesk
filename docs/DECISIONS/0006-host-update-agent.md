# ADR-0006: Host update agent topology

- Status: accepted
- Date: 2026-11-03
- Stakeholders: product owner, operator, admin

## Context

Stage 2 of ADR-0004 must perform the real host update: `git pull` of the whole
repository, `docker compose up -d --build` and a purge of the old images. The
deployment model of this instance is a **host checkout + compose build**
(`docs/DEPLOYMENT.md`), so all three commands run on the host, not in the `api`
container.

Facts that shape the design:

- The `api` container stays free of `git`, `docker`, `sudo` and a shell
  (`specs/18-self-update.md` §18.1). The privileged surface lives in a separate
  container.
- The repository is public, so `git pull` works without a personal access token;
  the agent must not depend on a credential that the operator may not have.
- **Self-reference:** the agent triggers a redeploy of the very stack it belongs
  to. If the agent is recreated by that redeploy, the run dies with it.
- The agent runs `docker compose` as a *client*; the daemon is the host's. Build
  contexts and relative paths are resolved by the client and the compose project
  directory, so the client and the daemon must see the **same absolute path** of
  the checkout.
- Alpine `community` provides `docker-cli` and `docker-cli-compose` for v3.22 to
  v3.24, `git` comes from `main`; `node:22-alpine` is Alpine 3.24.

## Decision

1. **One compose project, one network, one `.env`.** The agent is a service
   `update-agent` of the existing `docker-compose.yml`, behind the compose
   profile `update`. A plain `docker compose up -d --build` neither starts nor
   stops nor recreates a service whose profile is not enabled, so the agent
   survives the redeploy it triggers. It is started explicitly with
   `docker compose --profile update up -d update-agent`.
2. **Image.** `node:22-alpine` plus `git`, `docker-cli` and `docker-cli-compose`
   from the Alpine repositories; the agent code is bundled (esbuild), so the
   agent has no runtime npm dependencies.
3. **Mounts.** The checkout read-write (relative `.` → the compose project
   directory, so the client and the daemon agree on the path), the Docker socket
   `/var/run/docker.sock` read-write, and a small named volume for the agent's
   last-run state. No published port: the agent is reachable only on the
   internal `backend` network as `http://update-agent:8080`.
4. **Agent API.** Minimal and bearer-protected with `UPDATE_AGENT_TOKEN`
   (timing-safe comparison): `GET /status`, `POST /run`, `GET /runs`. No shell,
   no arbitrary command, no path from the request — the agent decides what a
   run is.
5. **Run steps.** `git -c safe.directory=/repo pull --ff-only` →
   `docker compose --project-directory /repo -f /repo/docker-compose.yml up -d
   --build` → `docker image prune -f`. The prune removes the dangling images of
   the previous local build; `docker image prune -a` is **not** used, because it
   would delete the images of other projects on a shared host.
6. **Ownership.** The agent runs as root (socket access) and records the owner
   of the checkout before the pull, then restores it afterwards, so the
   operator's own git commands on the host keep working.
7. **The API stays a client.** It calls the agent with the bearer token, writes
   the `update_runs` row and reconciles it with the agent's state after its own
   restart. The agent never sees the database.
8. **Trigger rules.** A new permission `system.update`, CSRF, a rate limit (one
   run at a time plus a cooldown) and an explicit confirmation in the UI — a
   confirm step, never a password.

## Alternatives

- **A separate compose project for the agent:** rejected — it would need the
  name of the stack's network and a second source of `.env` values, and the
  profile approach keeps one project, one network and one configuration.
- **A systemd timer or a host script triggered by the API:** rejected — the API
  has no path to the host, and a timer offers neither a UI trigger nor a run
  history in the application.
- **The agent writes the `update_runs` rows itself:** rejected — it would need
  database credentials; the API owns the data and the agent owns the run.
- **`docker image prune -a`:** rejected — it removes every unused image on the
  host, including images of unrelated projects.
- **Collecting the host password in the UI:** rejected — ADR-0004, §18.1.

## Consequences

- New service `update-agent`, new workspace `apps/agent`, new env keys
  `UPDATE_AGENT_URL` and `UPDATE_AGENT_TOKEN`, new permission `system.update`,
  new table `update_runs`.
- The update restarts the `api` container: the request that triggered it dies
  with it. The agent keeps the truth about the run; the API reconciles the row
  on the next poll and the UI shows the result.
- The agent is opt-in: without `docker compose --profile update up -d` the
  admin page reports that the agent is unreachable and the host update stays
  unavailable. The client-side update of stage 1 keeps working.
- The agent image needs the Docker socket, so it is as privileged as the host —
  it is started explicitly and never by the application.
