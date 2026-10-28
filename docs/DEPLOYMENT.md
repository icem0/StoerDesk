# Deployment

StörDesk runs as a single Docker Compose stack. Every value is read from
`.env`; the compose file itself is never edited for a deployment.

## Quickstart (production stack)

```bash
git clone https://github.com/icem0/StoerDesk.git
cd StoerDesk
npm run env:create          # writes .env with generated secrets
docker compose up -d --build
```

Open <http://localhost:8080>. The API is only reachable via the web frontend
(`/api/` is proxied by nginx); its own port stays on `127.0.0.1`.

```bash
docker compose ps           # status of all services
docker compose logs -f api  # API log
docker compose down         # stops the stack, keeps the volumes
docker compose down -v      # stops the stack and DELETES all data
```

## Services

| Service   | Profile  | Purpose                                    |
| --------- | -------- | ------------------------------------------ |
| `db`      | —        | PostgreSQL 16, source of truth             |
| `migrate` | —        | applies the Drizzle migrations, then exits |
| `api`     | —        | Fastify API on port 3000                   |
| `web`     | —        | nginx: PWA + reverse proxy for `/api/`     |
| `backup`  | `backup` | periodic `pg_dump` into the backup volume  |

## Configuration

`.env.example` documents every variable with its purpose and default.
`npm run env:create` copies the template to `.env` and replaces the secrets
(`POSTGRES_PASSWORD`, `SESSION_SECRET`, `SEED_ADMIN_PASSWORD`) with random values. The generated
password is URL-safe, so it can be used inside a connection URL.

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

Arcane deploys Compose projects and builds the images from the project folder.
The compose file therefore uses a **Git build context** by default:

```yaml
build:
  context: ${BUILD_CONTEXT:-https://github.com/icem0/StoerDesk.git#main}
```

Arcane clones the repository itself for every build, finds the `Dockerfile`
inside the clone and builds the images from it. The project folder only needs
the compose file — no checkout of the other files, no `Sync Files`. The
repository is public, so no credentials are needed; a repository registered
under _Customization → Git Repositories_ with the same URL is reused for its
credentials.

Every built service carries `pull_policy: build`. Without it a panel treats the
`image:` of the service as a finished image, keeps the old one and deploys
stale code — the fix for a bug would never reach the running container.

Override the context if the deployment runs from a fork or a tag:

```
BUILD_CONTEXT=https://github.com/icem0/StoerDesk.git#v0.0.6
```

On a developer machine `.env` sets `BUILD_CONTEXT=.`, so
`docker compose up -d --build` builds from the local checkout.

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
   - **Sync Files: on** — recommended, it makes the sources visible in the
     project folder; the build works without it thanks to the Git context
3. **Sync from Git**, then deploy the project.

Without _Sync Files_ Arcane copies only the compose file into the project
folder. With the Git build context that is enough, because Arcane fetches the
repository itself. With a local build context (`.`) the build fails with

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
them.

## Troubleshooting

```bash
docker compose config          # shows the resolved configuration
docker compose ps -a           # includes exited services such as "migrate"
docker compose logs db api     # logs of several services
docker compose run --rm api node apps/api/dist/index.js   # start the API manually
```

If the API restarts, the log usually names the invalid variable — the
configuration is validated at startup and the process exits with the name of
the offending variable.
