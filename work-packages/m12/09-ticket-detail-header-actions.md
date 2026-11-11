# WP-M12-09: Ticket detail — e-mail icon and cancel in the header, no way back to the list

format: small-model
status: done
depends-on: WP-M12-06
milestone: m12
phase: 12
context-budget: 22k tokens
spec: PLAN.md §14 user interface; specs/07-escalation.md §7.5
spec-lines: 60

files-read:

- PLAN.md
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/e2e/workflow.spec.ts
- docs/REPO-MAP.md

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/features/tickets/__tests__/ticket-detail-header-actions.test.tsx

interfaces:

- `TicketDetailPage` — the header carries the e-mail export button and the cancel button
- `GET /api/v1/tickets/:ticketNo` — unchanged, the page reads the status from it
- `POST /api/v1/tickets/:ticketNo/cancel` and `POST /api/v1/tickets/:ticketNo/uncancel` — unchanged

## Task

1. The header of the ticket detail view carries two actions on the top right next to
   the status and priority badges: the e-mail export as an icon button (envelope, 44 px
   target, `aria-label` from `detail.menu.email`) and the cancel button
   (`detail.menu.cancel`, `detail.menu.uncancel` for a cancelled ticket).
2. Both buttons leave the escalation section: the section keeps the status-dependent
   workflow actions and the permanent delete of an admin; the e-mail button and the
   cancel button are gone from its button row.
3. The way back to the list is deleted for good: the `list` entry of the action list,
   its handler branch and the `detail.back` / `detail.menu.back` labels of `de` and `en`
   are gone.
4. The unused `back` label of the E2E fixture in `apps/web/e2e/workflow.spec.ts` is
   removed, and the module comment of the detail page names the new header.
5. A component test asserts that the e-mail button and the cancel button sit in the
   header and not in the escalation section, that the e-mail button opens the e-mail
   page and that no "Zurück zur Liste" button exists.

## Non-goals

- No change of the workflow state machine, of the API routes or of the e-mail page.
- No change of the escalation section beyond the two buttons that move to the header.
- No new i18n key: the buttons reuse `detail.menu.email`, `detail.menu.cancel` and
  `detail.menu.uncancel`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- apps/web/src/features/tickets/__tests__/ticket-detail-header-actions.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the two header actions and the missing back
button.

## Handoff

- Files changed: the ticket detail page, the de/en ticket locale, the new component
  test, the E2E fixture label and `scripts/e2e-acceptance.mjs` (out of band — item 5
  re-pointed to the inline buttons of the escalation section, the locator assertions
  and the exit-code handling).
- Interfaces added: none.
- Verified: typecheck, lint, component test, i18n check, wp check, Playwright E2E
  green 14/14 on a throwaway database.
- Follow-up WP: none
- Open question: none
