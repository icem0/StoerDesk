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

| Service                 | Profile  | Host port  | Purpose                                            |
| ----------------------- | -------- | ---------- | -------------------------------------------------- |
| `db`                    | —        | none       | PostgreSQL 16, source of truth                     |
| `db-backup-pre-migrate` | —        | none       | one-shot `pg_dump` before the API migrates         |
| `api`                   | —        | none       | Fastify API on port 3000; runs migrations on start |
| `web`                   | —        | `WEB_PORT` | nginx: PWA + reverse proxy for `/api/`             |
| `backup`                | `backup` | none       | periodic `pg_dump` + uploads archive into the backup volume |

Before the API container starts, `db-backup-pre-migrate` writes
`/backups/pre-migrate-<timestamp>.sql.gz` into the backup volume and verifies the
archive. `api` waits for that container to exit successfully
(`service_completed_successfully`); a failed or empty dump stops the deployment
before any migration runs. The service has no profile, so the gate stays active
when the periodic `backup` profile is off.

The `web` container starts independently of the API: nginx resolves the API
host per request, so the UI is reachable while the API is starting or
temporarily down. Until the API answers, `/api/` returns 502 while `/healthz`
still returns 200.

## Host update

The default host update is a shell script on the server — no API access needed:

```bash
sh scripts/update.sh          # check GitHub, pull/build, clean up the images
sh scripts/update.sh --check  # only compare the local and remote version
sh scripts/update.sh --yes    # update without the confirmation
sh scripts/update.sh --cleanup # only clean up images: no pull, no rebuild
sh scripts/update.sh --gc     # additionally drop tagless images and build cache
                              # older than STOERDESK_GC_UNTIL hours (168)
```

The script compares the version of the running `api` container (its image carries `/app/VERSION`) with the newest GitHub tag — not the folder, which may be newer than the containers. It then pulls a
git checkout (`--ff-only --autostash`), runs
`docker compose up -d --build --remove-orphans` for the running stack and removes
the images this stack replaced. Running optional profiles such as `backup` stay
enabled; the `update` profile is never touched. The stack is briefly unreachable
during the rebuild.

**Why the clean-up works from image ids.** The rebuild moves the fixed
`:latest` tags of the built services to the new images, so the previous image of
every service loses its name. `docker image prune` with the project label only
finds such an image when the build wrote that label into it — it does not for a
build from a remote build context (`IMAGE_BUILD_CONTEXT`), not for the
`docker-compose` v1 fallback and not for an aborted build. Every update left one
tagless `<none>` image per service on the host. The script therefore snapshots
the image ids of its own image names (`STOERDESK_OWN_IMAGES`, by default
`stoerdesk-api`, `stoerdesk-web`) and of the Compose default
names of the project **before** the rebuild, and afterwards deletes by id
whatever is neither the current image of one of those names nor the image of a
container of this project — `docker rmi` without `-f`, so an image a container
still holds stays. A tagged or tagless image of another project is never touched;
`docker image prune -a` and an unscoped `docker image prune -f` are not used.
The backlog an older version left behind goes away with `--gc`, which also prunes
tagless images and build cache older than `STOERDESK_GC_UNTIL` hours — on a
shared host that window includes tagless images of other projects, so it stays an
explicit choice.

In a panel deployment such as Arcane the project folder is usually no git
checkout. The script then skips the pull and the compose build fetches the
sources itself; set `IMAGE_BUILD_CONTEXT` to the Git URL
(`https://github.com/icem0/StoerDesk.git#main`) as described
[below](#arcane), otherwise the build reuses the files of the project folder.

### Update menu (in the administration)

The administration can also start an update from the browser: the version badge
of the header is a button for a user with the permission `system.update` and
opens a panel that checks GitHub and starts the deployment
(`specs/18-self-update.md` §18.2, ADR-0007).

The check asks the GitHub API for the newest commit of `GITHUB_BRANCH` and
compares it with the installed version — the commit of the build (`GIT_COMMIT`)
or the version of the tracked `VERSION` file of the image. The panel shows the
installed version, the newest commit and the commits behind it.

The start does **not** deploy anything itself: the API calls the deploy hook
configured in `UPDATE_WEBHOOK_URL` with the header `X-Deploy-Token` and answers
immediately, because the deployment replaces the API container. The hook runs
the deployment — for example the deploy hook of a panel, or a small script on
the host that calls `scripts/update.sh`.

**The hook must answer immediately** and start the deployment in the background.
The API waits at most ten seconds for the answer; a hook that deploys
synchronously is reported as a refused webhook. The deployment replaces the
API container, so the connection of the request can die before the answer
arrives — the menu then says that the connection was interrupted and that the
stack is probably restarting. That is the normal case of a fast deployment.

| Variable               | Meaning                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `GITHUB_REPO`          | `owner/repo` of the upstream repository; empty disables the check |
| `GITHUB_BRANCH`        | the branch with the newest sources; default `main`                |
| `GITHUB_TOKEN`         | optional token of the GitHub API; it raises the rate limit        |
| `UPDATE_WEBHOOK_URL`   | the deploy hook the start calls; empty disables the start         |
| `UPDATE_WEBHOOK_TOKEN` | the value of the `X-Deploy-Token` header                          |

The tokens stay in the `api` container: they are never sent to the browser,
never logged and never committed. The `api` service has
`host.docker.internal:host-gateway` in its `extra_hosts`, so a hook on the host
is reachable under that name — for example
`http://host.docker.internal:9000/hooks/deploy`.

A second start inside five minutes is refused (`429 update_rate_limited`); the
window lives in the memory of the API process, and the deployment restarts the
API anyway.

### Deploy hook on the host

The update menu needs a deploy hook that performs the update. The repository
ships one: `scripts/deploy-hook.mjs`, started on the host (npm only, no
dependencies). It listens for `POST /hooks/deploy`, checks the header
`X-Deploy-Token` and starts `sh scripts/update.sh --yes` in the background,
logging to `deploy-hook.log`.

1. Create the token and put it into `.env` as `UPDATE_WEBHOOK_TOKEN`:

   ```bash
   openssl rand -hex 32
   ```

2. Set the webhook address in `.env`. The `api` container reaches the host
   under `host.docker.internal`:

   ```env
   UPDATE_WEBHOOK_URL=http://host.docker.internal:9000/hooks/deploy
   ```

3. Start the hook on the host, in the repository folder, with the same token:

   ```bash
   DEPLOY_HOOK_TOKEN=<the token> npm run deploy:hook
   ```

   Run it as a service (systemd, or the process manager of your host) so it
   survives a reboot. The user needs the right to run `docker`.

- **The port reaches the host only from the Docker network.** Bind the hook to
  the address of the Docker bridge (`DEPLOY_HOOK_HOST`, usually the address of
  `docker0`, e.g. `172.17.0.1`) and not to all interfaces, and keep port 9000
  closed to the outside. The token is the second barrier, not the first.
- **The hook answers at once.** A request while a deployment runs is answered
  with `409`. A deployment replaces the `api` container, so the connection of
  the start request may end before the answer arrives (see the menu text
  "Verbindung unterbrochen").
- **Without a hook** leave `UPDATE_WEBHOOK_URL` empty: the check still works and
  the start button says that no deploy webhook is configured.

### Deploy after a publish (CI)

The `publish images` workflow (`build.yml`) deploys after a successful build and
promotion: the `deploy` job runs only when both images were published and
`promote` moved `latest`, and only when its version is the highest `v[0-9]*` tag
in the repository. A late older run therefore never overwrites a newer
deployment.

Two repository secrets configure it:

| Secret                  | Meaning                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `DEPLOY_WEBHOOK_URL`    | URL of the redeploy receiver, for example `https://deploy.example.org/hooks/deploy`; empty skips the job with a notice |
| `DEPLOY_WEBHOOK_SECRET` | Shared secret of the receiver; empty skips the job with a notice                              |

The job sends `POST` with a JSON body and a 30-second timeout:

```json
{ "version": "v1.0.34", "sha": "<full commit sha>" }
```

It sends the HMAC-SHA256 of the body as
`X-Signature-256: sha256=<hex>` (key `DEPLOY_WEBHOOK_SECRET`) and — for the
receiver shipped in this repository — also `X-Deploy-Token:
$DEPLOY_WEBHOOK_SECRET`. `scripts/deploy-hook.mjs` authenticates with
`X-Deploy-Token` and ignores the body, so set `DEPLOY_HOOK_TOKEN` to the same
value as `DEPLOY_WEBHOOK_SECRET`. The job writes the version, the HTTP status
and `deployed` or `skipped` into its step summary.

The shipped hook binds to the Docker bridge and is reachable from the host and
its containers, not from a GitHub-hosted runner. Use a receiver the runner can
reach (a small public endpoint or a self-hosted runner on the Docker network), or
leave `DEPLOY_WEBHOOK_URL` empty and keep the manual host update.

## Configuration

`.env.example` documents every variable with its purpose and default.
`npm run env:create` copies the template to `.env` and replaces the secrets
(`POSTGRES_PASSWORD`, `SESSION_SECRET`, `SEED_ADMIN_PASSWORD`) with random values.
The generated password is URL-safe, so it can be used inside a connection
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

| Volume    | Content                                       | Variable         |
| --------- | --------------------------------------------- | ---------------- |
| `pgdata`  | database cluster, roles, all tickets          | `PGDATA_VOLUME`  |
| `uploads` | photos uploaded via the report form           | `UPLOADS_VOLUME` |
| `backups` | compressed database dumps and uploads archives | `BACKUP_VOLUME` |

The volume names are configurable via `.env`, so several installations can run
side by side on one host. To inspect or copy data out of a volume:

```bash
docker run --rm -v stoerdesk_pgdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/pgdata.tar.gz -C /data .
```

### Backups

```bash
docker compose --profile backup up -d      # starts the periodic dumps and uploads archives
docker run --rm -v stoerdesk_backups:/backups alpine ls -l /backups
```

Every backup cycle writes a pair into the `backups` volume: the database dump
`stoerdesk-<timestamp>.sql.gz` and the uploads archive
`stoerdesk-<timestamp>-uploads.tar.gz` of the `uploads` volume — the service
mounts the photos read-only, it never writes into them. `BACKUP_INTERVAL_SECONDS`
controls the interval, `BACKUP_RETENTION_DAYS` how long both are kept; that
window also bounds the `pre-migrate-*.sql.gz` dumps that every compose
deployment writes before the API migrates. The dump holds the ticket data,
including personal data, and is not encrypted at rest beyond the protection of
the `backups` volume.

Restore database and uploads **of one cycle together**: a `ticket_photos` row
whose file is missing leaves a broken ticket gallery. The dump goes back into
the `db` service, the matching archive into the `uploads` volume:

```bash
gunzip -c stoerdesk-20260101T120000Z.sql.gz | \
  docker compose exec -T db psql -U stoerdesk -d stoerdesk
docker run --rm \
  -v "$BACKUP_VOLUME:/backups:ro" \
  -v "$UPLOADS_VOLUME:/data/uploads" \
  alpine sh -c 'cd /data/uploads && tar xzf /backups/stoerdesk-20260101T120000Z-uploads.tar.gz'
```

Restoring the archive into a fresh volume replaces the whole gallery; extracting
it over the running volume keeps the files the archive does not contain.
`scripts/restore-drill.sh` proves the pair end to end: it starts the `db` and
`backup` services in a throw-away Compose project, seeds rows and a photo, lets
the profile write dump and archive, restores both into fresh targets and
compares the row counts and the photo manifest. The Docker CI job runs the drill
inside `scripts/docker-smoke.sh`; without a Docker daemon the drill reports
itself as unverified, never green.

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

Host commands address the same folder from outside the panel container, i.e.
through the data volume of Arcane:

```bash
ls -la /var/lib/docker/volumes/arcane_arcane-data/_data/projects/stoerdesk
```

That host path is what a shell on the host addresses — the path
`/app/data/projects/stoerdesk` exists only inside the Arcane container, and the
`working_dir` label of the running stack carries exactly that container-internal
path. The host update of [Host update](#host-update) therefore never follows
that label: change into the host path above and pin the folder with
`--project-directory "$PWD"`.

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

### `cd: /app/data/projects/<project>: No such file or directory`

An older revision of the start guide changed into the
`com.docker.compose.project.working_dir` label of the running stack. That label
names the project folder **inside the container that ran compose** — under a
panel such as Arcane it is no path of the host, and no amount of root rights
changes that. Change into the host path of the panel volume
([Arcane](#arcane)) and run the host update from there with
`--project-directory "$PWD"`.

### Disk full of `<none>` images

Every rebuild leaves the previous image of `api` and `web` without a tag on the
host; an update that was interrupted does it twice. The host update removes
them by image id — `scripts/update.sh` (see
[Host update](#host-update)). For the backlog an older version left behind:

```bash
docker images -f dangling=true        # the tagless backlog
sh scripts/update.sh --cleanup --gc   # plus tagless images and build cache
                                      # older than STOERDESK_GC_UNTIL hours
```

Without `--gc` the script removes nothing it does not own. With `--gc` it also
prunes the tagless images of other projects inside that window, so on a shared
host pick the window deliberately: `STOERDESK_GC_UNTIL=720 sh scripts/update.sh
--cleanup --gc`.
