# WP-M2-73: the panel build fetches the current sources

format: small-model
status: implemented
depends-on: WP-M2-71, WP-M2-72
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4, docs/DEPLOYMENT.md
spec-lines: 170

files-read:

- apps/agent/src/update-runner.ts — the git skip and the compose step
- scripts/update.sh — the shell update and its panel warning
- apps/agent/src/__tests__/update-runner.test.ts — the command recorder
- specs/18-self-update.md §18.4 — the agent steps

files-write:

- apps/agent/src/update-runner.ts
- scripts/update.sh
- apps/agent/src/__tests__/update-runner.test.ts

interfaces:

- no new command, route or environment variable
- a checkout without git metadata builds from
  `https://github.com/icem0/StoerDesk.git#main` unless `.env` already names a
  Git build context

## Task

1. In the agent, when the checkout is no git work tree, pass
   `IMAGE_BUILD_CONTEXT` to the compose step. Use the value of the project
   `.env` when it is a Git URL; otherwise use the repository URL.
2. In `scripts/update.sh`, do the same instead of only warning: export the
   repository URL (overridable with `STOERDESK_BUILD_CONTEXT`) when `.env` has
   no Git URL.
3. Add a regression test: no git checkout rebuilds with the Git build context;
   a git checkout gets no override.

## Non-goals

- No automatic edit of `.env`.
- No new agent or API setting; the repository URL is the product default.
- No UI change; the start guide is WP-M2-74.

## Acceptance

```bash
sh -n scripts/update.sh
npm run check
```

Expected: the script parses; typecheck, lint, tests, i18n and wp:check are green.

## Handoff

- Files changed: the files of `files-write`.
- Interfaces added: none.
- Verified: `sh -n`, `npm run check` (e2e skipped locally, no Chromium).
- Follow-up WP: WP-M2-74 (admin page version display and start guide).
- Open question: none.
