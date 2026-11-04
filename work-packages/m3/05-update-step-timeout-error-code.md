# WP-M3-05: the shared update schema knows the step timeout code

format: small-model
status: implemented
depends-on: WP-M3-04b
phase: 3
milestone: m3
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4
spec-lines: 30

files-read:

- packages/shared/src/schemas/update.ts — the fixed error codes
- apps/web/src/i18n/locales/de/settings.json — the `admin.update.host.errorCodes` block
- apps/web/src/i18n/locales/en/settings.json — the same block in English
- specs/18-self-update.md (§18.4)

files-write:

- packages/shared/src/schemas/update.ts
- specs/18-self-update.md
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- new fixed error code `update_step_timeout` in `UPDATE_ERROR_CODES`
- label key `admin.update.host.errorCodes.update_step_timeout` (de and en)

## Task

WP-M3-06 lets every step of a host update run against a deadline and fails the
run with `update_step_timeout` when a step passes it. This package lays the
shared groundwork only:

1. the fixed error code `update_step_timeout` is added to the shared update
   schema,
2. the spec §18.4 records the deadline rule (item 4: every step runs against
   `UPDATE_STEP_TIMEOUT_MS`),
3. the administration gains the translated label for the code, so the run table
   on `/admin/update` shows text instead of a bare key.

No agent logic changes here.

## Non-goals

- no timeout implementation and no `UPDATE_STEP_TIMEOUT_MS` in the agent
  (WP-M3-06),
- no new route, permission or flag.

## Acceptance

```bash
npm run i18n:check
npm run check
```

Expected: all green; de and en carry the same 604 keys including the new label.

## Handoff

- Files changed: `packages/shared/src/schemas/update.ts`, `specs/18-self-update.md`
  §18.4, both `settings.json` label blocks, changelog and backlog tables
- Interfaces added: `update_step_timeout`, the label key
- Verified: `npm run check` with system Chromium
- Follow-up WP: WP-M3-06 — `m3/06-update-agent-run-timeout.md`
- Open question: none
