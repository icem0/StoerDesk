# WP-M12-06: Ticket detail — remove the top-right menu, add the escalation section

format: small-model
status: done
depends-on: WP-M12-04, WP-M12-05
phase: 12
context-budget: 28k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 60

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- packages/shared/src/schemas/escalation-stages.ts

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx

interfaces:

- `GET /api/v1/escalation-stages`
- `POST /api/v1/tickets/:ticketNo/escalate`

## Task

1. Remove the top-right hamburger menu and its state; the header keeps only the
   status and priority badges.
2. Replace the comment composer with an escalation section: a dropdown that offers
   "Kommentar" plus every configured stage, preselecting the next stage after the
   last manual escalation, and the existing textarea.
3. Submit the text as a comment or as `escalation_set`; a stage may be chosen
   forwards or backwards.
4. Integrate the status-dependent workflow actions plus e-mail, cancel, delete and
   back into the same section as visible buttons with their existing confirm panels.
5. Show the stage name in the history and add the de/en texts.

## Non-goals

- No change to the workflow state machine.
- No automatic notification from a manual escalation.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the test proves the menu is gone, the default stage is the
next one and the backwards selection is possible.

## Handoff

- Files changed: detail page, de/en ticket locale, component test.
- Interfaces added: none beyond the two API calls.
- Verified: typecheck, component test, i18n check.
- Follow-up WP: none
- Open question: none
