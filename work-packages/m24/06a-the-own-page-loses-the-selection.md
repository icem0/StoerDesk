# WP-M24-06a: the own page loses the selection per event type

format: small-model
status: done
depends-on: WP-M24-05
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.4, §11.12, ADR-0045
spec-lines: 30

files-read:

- apps/web/src/settings/notifications-page.tsx (the own page with the seven switches)
- apps/web/src/settings/__tests__/notifications-page.test.tsx (the test of the page)

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/settings/__tests__/notifications-page.test.tsx

interfaces:

- the page reads no selection any more — every event goes over the channels of the user

## Task

1. Remove the section „Auswahl der Kanäle je Ereignis“ and the block of the
   readiness events from the own page: the seven switches are gone
   (ADR-0045).
2. Remove the queries of the selection and the write of it.
3. Remove the two tests of the selection from the test of the page.

The states of the channels of the user come from the API with
WP-M24-16 — the overview of the page reads them there.

## Non-goals

- No new state of the channels — WP-M24-16.
- No change of the API.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the page of the user holds no switch for an event type.

## Handoff

- Files changed: the own page, the test of the page
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M24-06b — the delivery goes over the channels of the user
- Open question: none
