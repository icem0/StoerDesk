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

| Service      | Profile         | Purpose                                    |
| ------------ | --------------- | ------------------------------------------ |
| `db`         | —               | PostgreSQL 16, source of truth             |
| `migrate`    | —               | applies the Drizzle migrations, then exits |
| `api`        | —               | Fastify API on port 3000                   |
| `web`        | —               | nginx: PWA + reverse proxy for `/api/`     |
| `ntfy`       | `notifications` | push notifications (web, desktop, mobile)  |
| `signal-cli` | `signal`        | Signal bridge (JSON-RPC over HTTP)         |
| `matrix`     | `matrix`        | Matrix homeserver (Synapse)                |
| `backup`     | `backup`        | periodic `pg_dump` into the backup volume  |

Profiles are independent and can be combined:

```bash
docker compose --profile notifications --profile matrix up -d
```

## Configuration

`.env.example` documents every variable with its purpose and default.
`npm run env:create` copies the template to `.env` and replaces the secrets
(`POSTGRES_PASSWORD`, `SESSION_SECRET`, `SEED_ADMIN_PASSWORD`,
`SYNAPSE_REGISTRATION_SHARED_SECRET`) with random values. The generated
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

| Volume        | Content                                       | Variable             |
| ------------- | --------------------------------------------- | -------------------- |
| `pgdata`      | database cluster, roles, all tickets          | `PGDATA_VOLUME`      |
| `uploads`     | photos uploaded via the report form           | `UPLOADS_VOLUME`     |
| `ntfy-cache`  | message cache of the ntfy server              | `NTFY_DATA_VOLUME`   |
| `signal-data` | account keys of the Signal number             | `SIGNAL_DATA_VOLUME` |
| `matrix-data` | homeserver database, media store, signing key | `MATRIX_DATA_VOLUME` |
| `backups`     | compressed database dumps                     | `BACKUP_VOLUME`      |

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

### ntfy

```bash
docker compose --profile notifications up -d
```

Set `NTFY_TOPIC` in `.env` and `NTFY_URL=http://ntfy` for the API. The
browser subscribes to `${NTFY_PUBLIC_URL}/${NTFY_TOPIC}`.

### Signal

signal-cli needs a phone number that receives SMS or a phone call. Register it
once:

```bash
docker compose --profile signal run --rm signal-cli -a +49123456789 register
docker compose --profile signal run --rm signal-cli -a +49123456789 verify <CODE>
```

Then set `SIGNAL_SOURCE_NUMBER` and `SIGNAL_RECIPIENTS` in `.env` and start the
stack. The API talks to the bridge via JSON-RPC (`/api/v1/rpc`); the account
keys stay in the `signal-data` volume.

### Matrix

Synapse creates its homeserver configuration on the first start. Register the
notification bot and create a room for the notifications:

```bash
docker compose --profile matrix up -d
npm run matrix:create-bot
```

The script prints `MATRIX_ACCESS_TOKEN` and `MATRIX_ROOM_ID`; add both to
`.env`. Invite further recipients to the room from any Matrix client.

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
