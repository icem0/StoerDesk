# WP-M14-75: The tunnel dependency is a valid compose schema

format: small-model
status: done
depends-on: WP-M14-74
phase: 14
milestone: m14
context-budget: 14k tokens
spec: docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (point 4), PLAN.md §18 (the Docker smoke test)
spec-lines: 30

files-read:

- docker-compose.yml (the service `cloudflared` of WP-M14-71)
- .github/workflows/check.yml (the job `Docker smoke test`)
- work-packages/m14/74-the-tunnel-token-does-not-stop-the-core-stack.md (the first repair of WP-M14-71)
- docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (point 4)

files-write:

- docker-compose.yml (the `depends_on` of the service `cloudflared`)
- work-packages/m14/ (this document)
- PLAN.md (§16 — the paragraph of the repair)
- work-packages/README.md (the backlog row and the status prose)

interfaces:

- `docker compose config` — the file of the tunnel profile passes the schema of the runner

## Task

1. The check run of WP-M14-74 was red in the job `Docker smoke test` with
   `validating docker-compose.yml: services.cloudflared.depends_on.ntfy missing
   property 'condition'`: the long syntax of `depends_on` requires the
   `condition` beside the `required`, and WP-M14-71 wrote only
   `required: false`. Add `condition: service_started` — the ntfy server stays
   optional, the tunnel can start on its own while only the profile `tunnel` is
   enabled.
2. Prove the file against the schema of the Compose specification
   (`compose-spec/schema/compose-spec.json`): the file is valid, the other three
   compose files of the repository (`docker-compose.dev.yml`,
   `docker-compose.debug.yml`, `docker-compose.local.yml`) were valid before and
   stay valid.

## Non-goals

- No change of the tunnel itself: image, command, network, token and profile
  stay as they are (WP-M14-71, WP-M14-74).
- No new gate script and no new dependency: the Docker smoke test of the CI is
  the gate, the schema check above is the proof of the repair.
- No change of the API, the ntfy server or the access control list.

## Acceptance

```bash
npm run wp:check
npm run check
node -e "require('yaml').parse(require('fs').readFileSync('docker-compose.yml','utf8'))"
```

Expected: all green; the compose file parses and passes the schema of the
Compose specification.

## Handoff

- Files changed: `docker-compose.yml`, this document, `PLAN.md` §16,
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: none — the second repair of WP-M14-71
- Verified: `npm run wp:check`, `npm run check` (typecheck, lint, 194 files and
  1302 tests, E2E 14 tests) green; the compose file passes the schema of the
  Compose specification, the three other compose files stay valid
- Follow-up WP: none — the Docker smoke test of the CI proves the repair
- Open question: none
