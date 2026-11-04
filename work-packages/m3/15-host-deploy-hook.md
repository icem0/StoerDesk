# WP-M3-15: host deploy hook for the update menu

format: small-model
status: implemented
depends-on: WP-M3-14
phase: 3
milestone: m3
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4, §18.7
spec-lines: 40

files-read:

- specs/18-self-update.md — the start contract and the webhook rules
- scripts/update.sh — the host update the hook starts
- docs/DEPLOYMENT.md — the deployment paths

files-write:

- scripts/deploy-hook.mjs
- package.json
- docs/DEPLOYMENT.md

interfaces:

- `npm run deploy:hook` — starts the hook on the host
- `DEPLOY_HOOK_TOKEN` (required, at least 32 characters), `DEPLOY_HOOK_PORT`
  (default 9000), `DEPLOY_HOOK_HOST` (default 0.0.0.0), `DEPLOY_HOOK_PATH`
  (default /hooks/deploy)
- `POST /hooks/deploy` with `X-Deploy-Token` — 202 and `sh scripts/update.sh --yes`
  in the background; 401 without a valid token, 404 for another path, 409 while
  a deployment runs

## Task

The update menu needs a deploy hook, and the repository has none. The hook is a
dependency-free Node script on the host:

1. `scripts/deploy-hook.mjs` checks the token with a timing-safe comparison,
   answers 202 at once and starts the update script detached, logging to
   `deploy-hook.log`. It refuses a second deployment while one runs.
2. `package.json`: the script `deploy:hook`.
3. `docs/DEPLOYMENT.md`: the setup in three steps, the token, the URL, the
   binding to the Docker bridge.

## Non-goals

- No test in the suite: the script starts a real deployment on a valid request.
  It was checked by hand for the refusals (401, 404); the accepted path is
  unverified until it runs on a host.
- No own process manager: systemd or the host's tool does that.

## Acceptance

```bash
npm run check
```

Expected: all green; the refusals of a wrong token and a wrong path were
checked by hand.

## Handoff

- Files changed: the hook script, `package.json`, the deployment guide
- Interfaces added: `npm run deploy:hook`, the environment keys above
- Verified: `npm run check` green; by hand the hook refuses a missing or wrong
  token (401) and a wrong path (404). The accepted deployment path is unverified.
- Follow-up WP: none
- Open question: none
