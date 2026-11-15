# WP-M14-71: Cloudflare Tunnel profile for ntfy

format: small-model
status: planned
depends-on: WP-M14-69
phase: 14
milestone: m14
context-budget: 16k tokens
spec: docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (points 4, 5)
spec-lines: 40

files-read:

- docker-compose.yml (the ntfy service of WP-M14-69)
- docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md
- docs/DEPLOYMENT.md (section Notifications)

files-write:

- docker-compose.yml
- .env.example
- docs/DEPLOYMENT.md

interfaces:

- Compose profile `tunnel`: service `cloudflared`, no host port
- `.env`: `CLOUDFLARE_TUNNEL_TOKEN`, `NTFY_HOSTNAME`

## Task

1. Add the service `cloudflared` to `docker-compose.yml` with `profiles: [tunnel]`,
   image `cloudflare/cloudflared` (pinned through `CLOUDFLARED_IMAGE`), command
   `tunnel --no-autoupdate run`, environment `TUNNEL_TOKEN` from
   `CLOUDFLARE_TUNNEL_TOKEN` (required with `:?` as the `POSTGRES_PASSWORD` line
   does), network `backend`, `depends_on: ntfy` with `required: false`, no
   `ports:`.
2. Add `.env.example` entries: `CLOUDFLARED_IMAGE`, `CLOUDFLARE_TUNNEL_TOKEN`
   (empty), with a comment that the public hostname of the tunnel must point to
   `http://ntfy:80`.
3. `docs/DEPLOYMENT.md`, section Notifications: add the ntfy profile (start, setup
   script, tunnel) and say that the tunnel is the only public path.

## Non-goals

- No DNS or tunnel creation through an API; the operator creates the tunnel in the
  Cloudflare dashboard and copies its token.
- No Cloudflare Access policy in this WP.

## Acceptance

```bash
npm run wp:check
npm run check
docker compose --profile ntfy --profile tunnel config > /dev/null
```

Expected: compose validation green; a missing `CLOUDFLARE_TUNNEL_TOKEN` stops the
config with a clear message. Docker is unverified if no daemon runs.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-72 (random topic names and the backup of the ntfy volume)
- Open question (if any):
