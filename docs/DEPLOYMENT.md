# Deployment

StörDesk runs as a single Docker Compose stack. Runtime configuration is read from
`.env`; the compose file itself is never edited for a deployment. The application
version comes from the tracked `VERSION` file, not from `.env`.

## Quickstart (production stack)

```bash
git clone https://github.com/icem0/StoerDesk.git
cd StoerDesk
npm run env:create          # writes .env with generated secrets
docker compose up -d --build
```

Open <http://localhost:3080> (`WEB_PORT`). The UI proxies `/api/` to the API; the
API itself publishes no host port — it is reachable only inside the internal
`backend` network (see [Networking](#networking)).

```bash
docker compose ps           # status of all services
docker compose logs -f api  # API log
docker compose down         # stops the stack, keeps the volumes
docker compose down -v      # stops the stack and DELETES all data
```

The version shown in the web shell is produced by the development workflow: the
pre-commit hook writes the next version into the tracked `VERSION` file, and the
post-commit hook tags exactly that value. Because `VERSION` is part of the commit,
an image build from a Git URL needs no `.env` entry and no git metadata. Rebuild
the `web` image after a pull to show the new version:

```bash
docker compose build web
docker compose up -d web
```

## Services

| Service        | Profile  | Host port  | Purpose                                            |
| -------------- | -------- | ---------- | -------------------------------------------------- |
| `db`           | —        | none       | PostgreSQL 16, source of truth                     |
| `api`          | —        | none       | Fastify API on port 3000; runs migrations on start |
| `web`          | —        | `WEB_PORT` | nginx: PWA + reverse proxy for `/api/`             |
| `backup`       | `backup` | none       | periodic `pg_dump` into the backup volume          |
| `update-agent` | `update` | none       | host update: pull, rebuild, prune the old images   |

The `web` container starts independently of the API: nginx resolves the API
host per request, so the UI is reachable while the API is starting or
temporarily down. Until the API answers, `/api/` returns 502 while `/healthz`
still returns 200.

## Host update

The default host update is a shell script on the server — no agent and no API
access needed:

```bash
sh scripts/update.sh          # check GitHub, pull/build, prune
sh scripts/update.sh --check  # only compare the local and remote version
sh scripts/update.sh --yes    # update without the confirmation
```

The script compares the tracked `VERSION` with the newest GitHub tag, pulls a
git checkout (`--ff-only --autostash`), runs `docker compose up -d --build` for
the running stack and prunes the old images of the project. Running optional
profiles such as `backup` stay enabled; the `update` profile is never touched.
The stack is briefly unreachable during the rebuild.

In a panel deployment such as Arcane the project folder is usually no git
checkout. The script then skips the pull and the compose build fetches the
sources itself; set `IMAGE_BUILD_CONTEXT` to the Git URL
(`https://github.com/icem0/StoerDesk.git#main`) as described
[below](#arcane), otherwise the build reuses the files of the project folder.

### Optional update agent (in-UI button)

The administration can also start a host update with a button. That path needs
the separate `update-agent` container; it is **not required** for the shell
script and can stay stopped.

```bash
docker compose --profile update up -d update-agent
```

- **Opt-in.** The agent belongs to the profile `update`, so a normal
  `docker compose up -d --build` neither starts nor stops nor recreates it.
  That is what lets the agent survive the redeploy it triggers itself.
- **The Docker socket is its only host privilege.** The agent is mounted with
  `/var/run/docker.sock` and therefore as privileged as the host. Start it
  deliberately; the normal deployment does not need it.
- **The checkout is mounted read-write** at `/repo`. The agent pulls it and
  the compose client of the agent reads the build context from it, so the
  rebuilt images contain the new code.
- **It publishes no host port.** The agent answers only on the internal
  `backend` network, and only with its bearer. The agent creates that bearer
  itself and writes it into the state volume; the API reads it from there, so
  **no secret has to be configured** — `UPDATE_AGENT_TOKEN` in `.env` is
  optional and only pins a fixed bearer.
- **A run restarts the API.** The rebuild replaces the API container, so the
  request that triggered the run dies with it. The agent keeps the truth about
  the run, and the API reconciles the run row after its restart. The
  administration shows the result on `/admin/update`.
- **The prune removes the dangling images** of the previous build of this
  project. `docker image prune -a` is not used: it would delete the images of
  other projects on a shared host.
- **Panels and non-git checkouts work.** When `/repo` is no git work tree (for
  example an Arcane project folder), the pull step is skipped and the compose
  build performs the update. The agent reads the compose project from its own
  container label, so it redeploys the stack Arcane started instead of creating
  a second one. Running optional profiles (`backup`) are kept; the `update`
  profile is never touched, so the agent survives its own redeploy.
  When `.env` has no Git URL, the agent and `scripts/update.sh` set
  `IMAGE_BUILD_CONTEXT` to the repository URL for the build, so a synced project
  folder does not rebuild the old files.

Without the agent the administration reports that the agent is not reachable
and shows the command that starts it; the client-side update of the PWA keeps
working.

## Configuration

`.env.example` documents every variable with its purpose and default.
`npm run env:create` copies the template to `.env` and replaces the secrets
(`POSTGRES_PASSWORD`, `SESSION_SECRET`, `SEED_ADMIN_PASSWORD`, `UPDATE_AGENT_TOKEN`) with random values. The token
of the update agent is optional: the agent creates its own bearer when the value is
empty. The generated password is URL-safe, so it can be used inside a connection
URL. The application version is not configured here: it comes from the tracked
`VERSION` file.

The file is read by:

- Docker Compose (variable substitution and `env_file` for the API),
- the API itself when it runs outside a container (`npm run dev`),
- drizzle-kit (`npm run db:generate`).

Nothing is written to `.env` automatically at runtime — changing a value means
recreating the affected container:

```bash
docker compose up -d --force-recreate api
```

## Persistent volumes

All state lives in named Docker volumes, so the data survives
`docker compose down` and container restarts.

| Volume    | Content                              | Variable         |
| --------- | ------------------------------------ | ---------------- |
| `pgdata`  | database cluster, roles, all tickets | `PGDATA_VOLUME`  |
| `uploads` | photos uploaded via the report form  | `UPLOADS_VOLUME` |
| `backups` | compressed database dumps            | `BACKUP_VOLUME`  |

The volume names are configurable via `.env`, so several installations can run
side by side on one host. To inspect or copy data out of a volume:

```bash
docker run --rm -v stoerdesk_pgdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/pgdata.tar.gz -C /data .
```

### Backups

```bash
docker compose --profile backup up -d      # starts the periodic dumps
docker run --rm -v stoerdesk_backups:/backups alpine ls -l /backups
```

`BACKUP_INTERVAL_SECONDS` controls the interval, `BACKUP_RETENTION_DAYS` how
long dumps are kept. To restore a dump:

```bash
gunzip -c stoerdesk-20260101T120000Z.sql.gz | \
  docker compose exec -T db psql -U stoerdesk -d stoerdesk
```

## Notifications

StörDesk ships no notification servers. Every channel talks to an instance that
already exists; a channel stays disabled while its address is empty.

| Channel  | Variables                                                                      |
| -------- | ------------------------------------------------------------------------------ |
| e-mail   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`            |
| ntfy     | `NTFY_URL`, `NTFY_PUBLIC_URL`, `NTFY_TOPIC`                                    |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                                       |
| Signal   | `SIGNAL_CLI_URL`, `SIGNAL_SOURCE_NUMBER`, `SIGNAL_RECIPIENTS`                  |
| Matrix   | `MATRIX_HOMESERVER`, `MATRIX_USER_ID`, `MATRIX_ROOM_ID`, `MATRIX_ACCESS_TOKEN` |

### ntfy

Set `NTFY_URL` to the server the API publishes to and `NTFY_PUBLIC_URL` to the
address the browser subscribes to. The browser listens on
`${NTFY_PUBLIC_URL}/${NTFY_TOPIC}`.

### Signal

`SIGNAL_CLI_URL` points to an existing signal-cli bridge (JSON-RPC over HTTP).
The bridge owns the registered number; `SIGNAL_SOURCE_NUMBER` names it and
`SIGNAL_RECIPIENTS` lists the recipients of new-ticket notifications.

### Matrix

`MATRIX_HOMESERVER` points to an existing homeserver. Create a user there, log
in with it and copy the access token into `MATRIX_ACCESS_TOKEN`; the Matrix ID
of that user is `MATRIX_USER_ID`. `MATRIX_ROOM_ID` is the room the
notifications are sent to.

## Networking

All services share the internal Compose network `backend`. Only the web
frontend publishes a host port (`WEB_PORT`); the API and Postgres stay
unpublished and are reached by container name (`http://api:3000`, `db:5432`).
The nginx of the web container proxies `/api/` to the API, so the browser never
needs an API port. That keeps the stack free of host-port collisions with other
projects on the same Docker host.

Health of the whole chain is checked through the web frontend:

```bash
curl -fsS http://localhost:3080/healthz          # nginx alive
curl -fsS http://localhost:3080/api/v1/health    # nginx -> API -> database
```

Direct access to the API is opt-in for debugging and monitoring:

```bash
docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d
curl -fsS http://127.0.0.1:3000/api/v1/health
```

`API_PUBLISHED_PORT` and `API_BIND_ADDRESS` apply only to that override; the
production stack never publishes the API. Inside a running stack the API is
also reachable without any published port:

```bash
docker compose exec api node -e \
  "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.json()).then(console.log)"
```

## HTTPS

The stack serves plain HTTP. Put a reverse proxy (nginx, Caddy, Traefik) in
front of port `WEB_PORT` for a public installation and set

```
COOKIE_SECURE=true
CORS_ORIGIN=https://stoerdesk.example.org
```

## Local development

The development stack only provides the database; API and web run on the host:

```bash
npm install
npm run env:create
docker compose -f docker-compose.dev.yml up -d db
npm run db:migrate -w @stoerdesk/api
npm run dev
```

| Service | URL                                 |
| ------- | ----------------------------------- |
| Web     | http://localhost:5173               |
| API     | http://localhost:3000               |
| Health  | http://localhost:3000/api/v1/health |

## Arcane

The compose file builds from the local checkout by default:

```yaml
build:
  context: ${IMAGE_BUILD_CONTEXT:-.}
```

That is the right default for a normal `git clone` and for a developer machine.
A deployment panel that only copies the compose file into its project folder
must set the Git URL instead:

```
IMAGE_BUILD_CONTEXT=https://github.com/icem0/StoerDesk.git#main
```

Arcane then clones the repository itself for every build, finds the `Dockerfile`
inside the clone and builds the images from it. The project folder only needs
the compose file — no checkout of the other files, no `Sync Files`. The
repository is public, so no credentials are needed; a repository registered
under _Customization → Git Repositories_ with the same URL is reused for its
credentials.

Always deploy with `--build` (or an equivalent panel setting) so a changed
source tree produces a fresh image. The compose file intentionally does not set
`pull_policy: build`; older Compose versions do not understand it.

> **Important:** in Arcane set `IMAGE_BUILD_CONTEXT` to the Git URL. With the
> default `.` the panel builds from the project folder; if that folder holds
> only the compose file, the build fails with
> `dockerfile not found: stat /app/data/projects/<project>/Dockerfile`.

Override the context if the deployment runs from a fork or a tag:

```
IMAGE_BUILD_CONTEXT=https://github.com/icem0/StoerDesk.git#v0.0.6
```

A developer machine builds from the working tree without an override file:

```bash
docker compose up -d --build
```

The explicit override file remains available:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

### Deploying in Arcane

1. **Customization → Git Repositories**: add
   `https://github.com/icem0/StoerDesk.git` (public repository, an SSH key or
   token is optional).
2. **Environments → Git Syncs → Add Sync** (or _Projects → Create Project →
   From Git Repo_):
   - Direction: **Pull**
   - Sync name: `stoerdesk`
   - Repository: _StoerDesk_, Branch: `main`
   - Compose File Path: `docker-compose.yml`
   - **Sync Files: on** — recommended; it copies `Dockerfile`, `apps/` and
     `packages/` into the project folder, so the default local build works
3. In the project `.env`, set
   `IMAGE_BUILD_CONTEXT=https://github.com/icem0/StoerDesk.git#main` if
   _Sync Files_ is off.
4. **Sync from Git**, then deploy the project.

Without _Sync Files_ Arcane copies only the compose file into the project
folder. The Git build context is then required, because Arcane fetches the
repository itself. With the default local context (`.`) and no synced sources,
the build fails with

```
failed to prepare project images for deploy: dockerfile not found:
stat /app/data/projects/stoerdesk/Dockerfile: no such file or directory
```

With _Sync Files_ the whole folder of the compose file — the repository root —
is copied, so `Dockerfile`, `apps/` and `packages/` are available as build
context. The same sync can be imported as JSON on the **Git Syncs** page:

```json
[
  {
    "syncName": "stoerdesk",
    "gitRepo": "StoerDesk",
    "branch": "main",
    "dockerComposePath": "docker-compose.yml",
    "autoSync": true,
    "syncInterval": 5,
    "syncDirectory": true
  }
]
```

Check on the host whether the checkout is complete:

```bash
docker exec arcane ls -la /app/data/projects/stoerdesk   # Dockerfile must exist
```

### Environment

The project `.env` needs at least `POSTGRES_PASSWORD` and `SESSION_SECRET`
(values from `npm run env:create`); the compose file refuses to start without
them. The application version needs no entry: the `web` build reads the tracked
`VERSION` file from the build context.

## Troubleshooting

```bash
docker compose config          # shows the resolved configuration
docker compose ps -a           # shows all services, including stopped ones
docker compose logs db api     # logs of several services
docker compose run --rm api    # start the API manually (runs migrations first)
```

If the API restarts, the log usually names the invalid variable — the
configuration is validated at startup and the process exits with the name of
the offending variable.

### `port is already allocated`

```
Bind for 0.0.0.0:3080 failed: port is already allocated
```

Only the web frontend occupies a host port. Move it to a free one, e.g.
`WEB_PORT=3081` (and adapt `CORS_ORIGIN`). The API and the database publish no
port, so they cannot cause this error — if it names an API port, a debug
override (`docker-compose.debug.yml`) or a stale container of an older
deployment is still running:

```bash
docker ps --filter publish=3000      # who holds the port
docker compose down                  # removes the old stack's containers
```
