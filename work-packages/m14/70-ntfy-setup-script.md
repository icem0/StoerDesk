# WP-M14-70: Setup script for the ntfy access control list and token

format: small-model
status: planned
depends-on: WP-M14-69
phase: 14
milestone: m14
context-budget: 18k tokens
spec: docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (points 3, 6)
spec-lines: 40

files-read:

- docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md
- ntfy/server.yml (WP-M14-69)
- package.json (the `env:create` script as the pattern for an npm command)

files-write:

- scripts/ntfy-setup.sh
- package.json

interfaces:

- `npm run ntfy:setup` — creates the ACL and the token and writes `NTFY_TOKEN` to `.env`

## Task

1. `scripts/ntfy-setup.sh` runs inside the ntfy container through
   `docker compose --profile ntfy exec ntfy ntfy ...`. It checks that the container
   is running and that `auth-default-access` is `deny-all`, and stops otherwise.
2. It creates the user `stoerdesk-api` with role `user` if it does not exist
   (`ntfy user list` decides), then sets `ntfy access stoerdesk-api "stoerdesk-*"
   read-write` and `ntfy access everyone "stoerdesk-*" read-only`. Both commands are
   idempotent: running the script twice changes nothing.
3. If `NTFY_TOKEN` in `.env` is empty, it runs `ntfy token add stoerdesk-api` and
   writes the printed `tk_...` value into `.env` (a `sed` on the single key only).
   The token is never printed to the terminal and never written to a log file.
4. The script never prints the value of an existing token and never overwrites a
   non-empty `NTFY_TOKEN`.

## Non-goals

- No change of the ntfy server configuration (WP-M14-69).
- No change of the API; the API reads `NTFY_TOKEN` through the existing
  channel configuration (ADR-0022).

## Acceptance

```bash
npm run wp:check
npm run check
shellcheck scripts/ntfy-setup.sh        # if available; otherwise report it as unverified
```

Manual check on a running profile (report as unverified if not run):
anonymous publish to `stoerdesk-pruef` answers 403; publish with the token answers
200; anonymous read of `anderes` answers 403.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M14-71 (Cloudflare Tunnel profile)
- Open question (if any):
