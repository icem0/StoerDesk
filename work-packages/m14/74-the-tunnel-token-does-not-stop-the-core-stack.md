# WP-M14-74: The tunnel token does not stop the core stack

format: small-model
status: done
depends-on: WP-M14-73
phase: 14
milestone: m14
context-budget: 16k tokens
spec: docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (point 4), PLAN.md §18 (the Docker smoke test)
spec-lines: 40

files-read:

- docker-compose.yml (the service `cloudflared` of WP-M14-71)
- scripts/ntfy-setup.sh (the access control list and the token of WP-M14-70)
- .env.example (the keys of the tunnel)
- docs/DEPLOYMENT.md (the own-ntfy-server subsection)
- .github/workflows/check.yml (the job `Docker smoke test`)

files-write:

- docker-compose.yml (the `TUNNEL_TOKEN` of the service `cloudflared` and the comment above it)
- scripts/ntfy-setup.sh (the state of `CLOUDFLARE_TUNNEL_TOKEN`)
- .env.example (the comment of `CLOUDFLARE_TUNNEL_TOKEN`)
- docs/DEPLOYMENT.md (the own-ntfy-server subsection)

interfaces:

- `docker compose` — the config of the core stack succeeds while `CLOUDFLARE_TUNNEL_TOKEN` is empty
- `npm run ntfy:setup` — names the state of `CLOUDFLARE_TUNNEL_TOKEN`, never its value

## Task

1. `docker-compose.yml`: the `TUNNEL_TOKEN` of the service `cloudflared` reads
   `${CLOUDFLARE_TUNNEL_TOKEN:-}` instead of the strict `${CLOUDFLARE_TUNNEL_TOKEN:?…}`.
   Compose interpolates every service of the file, also the ones of a profile
   that is not selected: the strict check of WP-M14-71 therefore stopped the
   config of the **core** stack of every deployment without a tunnel (and the
   Docker smoke test of the CI) with a message about a tunnel that was never
   wanted. The comment above the service names that reason.
2. `scripts/ntfy-setup.sh` names the state of `CLOUDFLARE_TUNNEL_TOKEN` in
   `.env` (empty, missing or set) after the access control list is written; it
   never prints the value and never creates the token — the operator copies it
   from the Cloudflare dashboard.
3. `.env.example` and `docs/DEPLOYMENT.md` describe the new behaviour: while
   the token is empty, the core stack starts unchanged and the tunnel container
   stays stopped with the error of `cloudflared` in its log.

## Non-goals

- No change of the tunnel itself: the image, the command, the network, the
  `depends_on` and the profile stay as they are (WP-M14-71).
- No new script and no new Compose file; the operator command
  `docker compose --profile ntfy --profile tunnel up -d` stays.
- No change of the API, the ntfy server or the access control list.

## Acceptance

```bash
npm run wp:check
npm run check
sh -n scripts/ntfy-setup.sh
node -e "require('yaml').parse(require('fs').readFileSync('docker-compose.yml','utf8'))"
```

Expected: all green; the compose file parses, the shell script is valid and the
strict interpolations of the file are all satisfied by `.env.example`.

## Handoff

- Files changed: `docker-compose.yml`, `scripts/ntfy-setup.sh`, `.env.example`,
  `docs/DEPLOYMENT.md`
- Interfaces added: none — a repair of WP-M14-71
- Verified: `npm run wp:check`, `npm run check` (typecheck, lint, 194 files and
  1302 tests, E2E 14 tests) green; the compose file parses, `sh -n` on the
  setup script is clean, the only strict interpolations left are
  `POSTGRES_PASSWORD` and `SESSION_SECRET`, both filled by `.env.example`
- Follow-up WP: none — the Docker smoke test of the CI proves the repair
- Open question: none
