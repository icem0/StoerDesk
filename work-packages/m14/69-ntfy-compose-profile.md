# WP-M14-69: ntfy as an optional Compose profile

format: small-model
status: done
depends-on: —
phase: 14
milestone: m14
context-budget: 18k tokens
spec: docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md; docs/DEPLOYMENT.md (Notifications)
spec-lines: 45

files-read:

- docker-compose.yml (the `backup` profile as the pattern, the `backend` network)
- docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md
- .env.example

files-write:

- docker-compose.yml
- ntfy/server.yml
- .env.example

interfaces:

- Compose profile `ntfy`: service `ntfy` on the `backend` network, no host port
- volume `ntfydata` mounted at `/var/lib/ntfy`
- environment keys `NTFY_BASE_URL`, `NTFY_TOKEN`, `NTFY_HOSTNAME` (in `.env`)

## Task

1. Add the service `ntfy` to `docker-compose.yml` with `profiles: [ntfy]`, image
   `binwiederhier/ntfy` (pinned by a variable `NTFY_IMAGE` with that default),
   command `serve`, `restart: unless-stopped`, the json-file logging of the other
   services, network `backend`, no `ports:` entry.
2. Mount `./ntfy/server.yml` read-only at `/etc/ntfy/server.yml` and the named
   volume `ntfydata` at `/var/lib/ntfy`. Declare `ntfydata` in the top-level
   `volumes:` block.
3. Create `ntfy/server.yml` with: `base-url: ${NTFY_BASE_URL}` (set through the
   environment, see step 4), `auth-file: /var/lib/ntfy/user.db`,
   `auth-default-access: deny-all`, `behind-proxy: true`,
   `proxy-forwarded-header: CF-Connecting-IP`, `cache-file:
   /var/lib/ntfy/cache.db`. No secret in this file.
4. Add to `.env.example`, with a comment that each value is set by the operator:
   `NTFY_IMAGE`, `NTFY_BASE_URL` (the public https address, e.g.
   `https://ntfy.example.org`), `NTFY_HOSTNAME`, `NTFY_TOKEN` (empty, filled by
   WP-M14-70). `NTFY_TOKEN` is never a default value.
5. Validate the file: `docker compose config` must succeed with and without the
   profile; the Docker check is not available in the development container and is
   reported as unverified.

## Non-goals

- No setup script (WP-M14-70), no tunnel (WP-M14-71), no change of the random
  topic names (WP-M14-72).
- No change of the core services `db`, `api`, `web`.

## Acceptance

```bash
npm run wp:check
npm run check
docker compose config > /dev/null                      # without the profile
docker compose --profile ntfy config > /dev/null       # with the profile
```

Expected: all green; the compose file without `--profile ntfy` contains no ntfy
service. Report the Docker commands as unverified if no daemon is available.

## Handoff

- Files changed: `docker-compose.yml` (the `ntfy` service after `backup`, the
  `ntfydata` volume, the profile line in the header comment, the network comment),
  `ntfy/server.yml` (new), `.env.example` (`NTFY_IMAGE`, `NTFY_BASE_URL`,
  `NTFY_HOSTNAME` and the extended `NTFY_TOKEN` comment).
- Interfaces added: Compose profile `ntfy` with the service `ntfy` on the
  `backend` network and no `ports:` entry, the read-only bind mount of
  `ntfy/server.yml` at `/etc/ntfy/server.yml`, the named volume `ntfydata` at
  `/var/lib/ntfy`, the environment keys `NTFY_IMAGE`, `NTFY_BASE_URL`,
  `NTFY_HOSTNAME` and `NTFY_TOKEN` in `.env`.
- Verified: `npm run wp:check` and the full `npm run check` green; both YAML files
  parse (Prettier and the `yaml` package: the `ntfy` service carries
  `profiles: [ntfy]`, no `ports`, the two mounts and the json-file logging).
  `docker compose config` with and without `--profile ntfy` is **unverified**: the
  development container has no Docker daemon, CI runs the smoke test instead.
- Follow-up WP: WP-M14-70 (setup script for the access control list and token)
- Open question: none
