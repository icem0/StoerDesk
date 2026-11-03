# WP-M2-68: the run carries why the command failed

format: small-model
status: implemented
depends-on: WP-M2-63
phase: 2
context-budget: 14k tokens
spec: specs/18-self-update.md §18.4–§18.6
spec-lines: 130

files-read:

- apps/agent/src/update-runner.ts — the three steps and their command results
- apps/agent/src/index.ts — the command runner and the state file of the agent
- apps/api/src/update/client.ts — the client that validates every agent answer
- packages/shared/src/schemas/update.ts — the run contract of §18.6
- apps/agent/src/**tests**/update-runner.test.ts — the failure tests to extend

files-write:

- packages/shared/src/schemas/update.ts
- apps/agent/src/update-runner.ts

interfaces:

- `agentRunSchema` gains `errorDetail`: `string | null`, max 2000 characters,
  `null` on a success and `null` for a state file written before this WP
- `UPDATE_ERROR_DETAIL_MAX_CHARS` and `updateErrorDetailSchema` in the shared
  package

## Task

1. Shared: add `errorDetail` to `agentRunSchema` — the sanitized output tail of
   the failing step, bounded by `UPDATE_ERROR_DETAIL_MAX_CHARS`, nullable with
   `default(null)` so the state file of an older agent still parses.
2. Agent: `step()` answers the command result; a failed step puts the output of
   that command into `run.errorDetail` — stderr first, stdout when stderr is
   empty, the last `UPDATE_ERROR_DETAIL_MAX_CHARS` characters.
3. Sanitize before storing: no credential survives. Redact the userinfo part of
   a URL (`https://user:token@host`), known token shapes (`ghp_…`,
   `github_pat_…`, `xox[baprs]-…`), an `Authorization:` value and a
   `token=`/`password=`/`secret=`/`api_key=` assignment; strip control
   characters and collapse `\r`.
4. The detail stays English command output — it is never translated and the
   error `code` of the run stays the fixed code of §18.4.

## Non-goals

- No change of the `update_runs` table, of the API routes or of the UI — the
  detail is stored and shown by WP-M2-69 and WP-M2-70.
- No per-step detail, no full log, no log file: one bounded tail per run.
- No new agent endpoint, no new permission.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, i18n and wp:check green; the runner test
proves the detail of a failed pull, the truncation and the redaction.

## Handoff

- Files changed: the two files of `files-write` plus the tests.
- Interfaces added: `errorDetail` on `agentRunSchema`,
  `updateErrorDetailSchema`, `UPDATE_ERROR_DETAIL_MAX_CHARS`.
- Verified: `npm run check`.
- Follow-up WP: WP-M2-69 (`69-update-run-error-detail-api.md`, created with
  this commit), then WP-M2-70 (`70-update-run-error-detail-ui.md`).
- Open question: none.
