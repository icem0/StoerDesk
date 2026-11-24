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

- apps/web/src/settings/__tests__/readiness-selection.test.tsx (the stale test)
- apps/web/src/i18n/locales/de/common.json (the labels of the selection)
- apps/web/src/i18n/locales/en/common.json (the labels of the selection)

files-write:

- apps/web/src/settings/__tests__/readiness-selection.test.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/features/notifications/inbox-page.tsx, apps/web/src/admin/delivery-page.tsx

interfaces:

- none — the block of the readiness events is gone with WP-M24-06a

## Task

1. Delete the test file `readiness-selection.test.tsx`: it proves the block of
   the readiness events on the own page, and WP-M24-06a removed that block
   (ADR-0045 — every event goes over the channels of the user). The test waits
   for checkboxes that the page never renders any more and fails in the check
   run.
2. Remove the labels of the selection per event type from the `common`
   namespace in `de` and `en`: the whole `notifications.selection.*` object is
   orphaned by WP-M24-06a. The names of the events move to
   `notifications.eventNames.*` — the inbox and the page of the delivery
   problems show them. The labels of the readiness block are already gone with
   the block.

## Non-goals

- No change of the own page — WP-M24-06a removed the block.
- No change of the API — the route of the preferences leaves with its own
  package.
- No new state of the channels — WP-M24-16.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; no test waits for a readiness checkbox.

## Handoff

- Files changed: the stale test of the block, the labels of the selection in
  `de` and `en`
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M24-06e — the routes of the selection leave the API
- Open question: none
