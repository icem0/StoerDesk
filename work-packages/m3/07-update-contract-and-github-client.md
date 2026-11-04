# WP-M3-07: the update contract and the GitHub client

format: small-model
status: implemented
depends-on: WP-M3-06
phase: 3
milestone: m3
context-budget: 18k tokens
spec: specs/18-self-update.md §18.3, §18.5
spec-lines: 60

files-read:

- packages/shared/src/schemas/update.ts — the schemas of the retired agent
- apps/api/src/update/client.ts — the client of the retired agent
- apps/api/src/integrations/bmacloud/client.ts — the pattern of an external client
- packages/shared/src/schemas/bmacloud.ts — the pattern of a shared contract
- docs/DECISIONS/0006-host-update-agent.md — the decision that is replaced
- PLAN.md §17, §18

files-write:

- specs/18-self-update.md
- docs/DECISIONS/0007-update-check-and-deploy-webhook.md
- packages/shared/src/schemas/update.ts
- apps/api/src/update/github.ts

interfaces:

- `createGitHubClient(config, fetchImpl?): GitHubClient` — `latestCommit()` and
  `compare(base, head)`
- `GitHubError.code` — `update_not_configured`, `update_check_failed`,
  `update_github_rate_limited`
- `updateCheckResponseSchema` — the answer of the check route
- `updateStartResponseSchema` — the answer of the start route
- `UPDATE_ERROR_CODES` — the error codes of the update routes

## Task

The update control of the administration is replaced: the API checks GitHub and
hands the deployment to a webhook target, instead of a privileged agent
container (ADR-0007).

1. Rewrite `specs/18-self-update.md` for the new contract: the update menu in
   the shell header, the check route, the start route, the configuration, the
   security rules. The shell script of the operator stays (§18.7).
2. Add `docs/DECISIONS/0007-update-check-and-deploy-webhook.md`, mark ADR-0006
   as superseded and extend the index of `docs/DECISIONS.md`.
3. Replace the shared schemas of the agent by the schemas of the new contract:
   `updateCommitSchema`, `updateCheckResponseSchema`,
   `updateStartResponseSchema` and the list of the error codes.
4. Add `apps/api/src/update/github.ts`: the read-only client of the GitHub API
   with the two calls of §18.3, the bearer token only as `Authorization` and
   the rate limit of the API named separately from a generic failure.
5. Add the unit test of the client.

## Non-goals

- No route and no environment key in this WP — they are WP-M3-08.
- No change of the agent yet; it is removed in WP-M3-11.
- No write access to GitHub, no release creation, no tag creation.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/api
npm run test:run -w @stoerdesk/api
npm run check
```

Expected: all green; the new unit test proves the two calls, the bearer header,
the rate limit and the malformed answer.

## Handoff

- Files changed: `specs/18-self-update.md`, `docs/DECISIONS/0007-update-check-and-deploy-webhook.md`,
  `docs/DECISIONS/0006-host-update-agent.md` (superseded), `docs/DECISIONS.md`,
  `packages/shared/src/schemas/update-menu.ts`,
  `packages/shared/src/schemas/index.ts`, `apps/api/src/update/github.ts`,
  `apps/api/src/update/__tests__/github.spec.ts`, `docs/REPO-MAP.md`,
  `CHANGELOG.md`
- Interfaces added: `createGitHubClient`, `GitHubClient`, `GitHubCommit`,
  `GitHubComparison`, `GitHubError`, `updateCommitSchema`,
  `updateCheckResponseSchema`, `updateStartResponseSchema`
- Verified: `npm run check` (67 files, 418 tests, i18n and wp-check green); the
  new unit test covers the two calls, the bearer header, the rate limit, the
  unreachable API and the malformed answer
- Follow-up WP: WP-M3-08 (the routes and the environment), WP-M3-09 (the
  deployment configuration), WP-M3-10 (the menu), WP-M3-11 (the removal of the
  agent), WP-M3-12 (the documentation)
- Open question: none
