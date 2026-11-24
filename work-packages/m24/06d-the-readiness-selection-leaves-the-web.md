# WP-M24-06d: the readiness selection leaves the web

format: small-model
status: done
depends-on: WP-M24-06a
phase: 24
milestone: m24
context-budget: 8k tokens
spec: specs/10-notifications.md §11.4, ADR-0045
spec-lines: 30

files-read:

- apps/web/src/settings/notifications-page.tsx (the own page without the block)
- apps/web/src/settings/__tests__/readiness-selection.test.tsx (the stale test)
- apps/web/src/i18n/locales/de/settings.json (the labels of the block)
- apps/web/src/i18n/locales/en/settings.json (the labels of the block)

files-write:

- apps/web/src/settings/__tests__/readiness-selection.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- none — the block of the readiness events is gone with WP-M24-06a

## Task

1. Delete the test file `readiness-selection.test.tsx`: it proves the block of
   the readiness events on the own page, and WP-M24-06a removed that block
   (ADR-0045 — every event goes over the channels of the user). The test waits
   for checkboxes that the page never renders any more and fails in the check
   run.
2. Remove the labels of the block from the `settings` namespace in `de` and
   `en`: `notifications.heading`, `notifications.hint`,
   `notifications.instanceHint`, `notifications.save`, `notifications.saved` and
   the three `notifications.events.oncall.*` names. The `notifications.ntfy.*`
   names stay — the test of the own topic uses them.

## Non-goals

- No change of the own page — WP-M24-06a removed the block.
- No change of the API — the route of the preferences leaves with its own
  package.
- No change of the labels of the selection per event type in `common` — they
  are orphaned by WP-M24-06a and leave with the same route.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; no test waits for a readiness checkbox.

## Handoff

- Files changed: the stale test of the block, the labels of the block in `de`
  and `en`
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M24-06c — the delivery goes over the channels of the user
  (the file of the package is missing — the announcement of WP-M24-06b names it)
- Open question: none
