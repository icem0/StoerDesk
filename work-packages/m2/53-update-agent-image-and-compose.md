# WP-M2-53: the update agent image, compose service and env wiring

format: small-model
status: planned
depends-on: WP-M2-52
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- Dockerfile — the image targets of the repository
- docker-compose.yml — the services, the network and the volumes
- docs/DEPLOYMENT.md — the deployment steps the service joins
- .env.example — the environment template
- scripts/create-env.mjs — the secret generation
- apps/agent/package.json — the build script of the new workspace

files-write:

- Dockerfile — the target `agent`
- docker-compose.yml — the service `update-agent`
- .env.example — `UPDATE_AGENT_URL`, `UPDATE_AGENT_TOKEN`
- scripts/create-env.mjs — the generation of `UPDATE_AGENT_TOKEN`

interfaces:

- image `stoerdesk-agent` (target `agent`): `node:22-alpine` + `git`,
  `docker-cli`, `docker-cli-compose`, the bundled agent
- service `update-agent` in the compose project, behind the profile `update`,
  reachable as `http://update-agent:8080` on the internal `backend` network
- env keys `UPDATE_AGENT_TOKEN` (secret), `UPDATE_AGENT_URL` (the API's view
  of the agent)

## Task

1. Add the target `agent` to the `Dockerfile`: `node:22-alpine`, `apk add --no-
   cache git docker-cli docker-cli-compose`, the bundled agent from
   `apps/agent/dist`, `USER node`, `EXPOSE 8080`.
2. Add the service `update-agent` to `docker-compose.yml`:
   - `profiles: ['update']` — a plain `docker compose up -d --build` never
     starts, stops or recreates it, so it survives the redeploy it triggers.
   - `build: { context: ., dockerfile: Dockerfile, target: agent }`, the image
     name `stoerdesk-agent`.
   - volumes: the checkout read-write (`.:/repo`), the Docker socket
     (`/var/run/docker.sock:/var/run/docker.sock`) and a named volume
     `update-state` → `/state`.
   - `environment`: `UPDATE_AGENT_TOKEN` from `.env`, the paths and the port.
   - `restart: unless-stopped`, the internal `backend` network, **no published
     port**.
3. Add `UPDATE_AGENT_TOKEN` (empty) and `UPDATE_AGENT_URL`
   (`http://update-agent:8080`) to `.env.example`.
4. Generate a random `UPDATE_AGENT_TOKEN` in `scripts/create-env.mjs`, like the
   other secrets.

## Non-goals

- No API route, no UI (WP-M2-54, WP-M2-55).
- No published host port for the agent, no `privileged: true`, no extra
  capabilities: the Docker socket is the only host privilege.
- No start of the agent in the normal deployment — it stays opt-in
  (`docker compose --profile update up -d update-agent`).

## Acceptance

```bash
npm run check
npm run build
docker compose config
```

Expected: the gates are green; `docker compose config` resolves the new service
and shows the profile and the mounts. The image build itself runs in CI
(`docker-smoke`), the development container has no Docker daemon.

## Handoff

- Files changed: the four files of `files-write`.
- Interfaces added: the image target, the compose service, the env keys.
- Verified: `npm run check`, `npm run build`, `docker compose config`.
- Follow-up WP: WP-M2-54 (the admin API).
- Open question: none.
