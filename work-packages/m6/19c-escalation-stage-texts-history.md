# WP-M6-19c: the ticket history shows the escalation reason

format: small-model
status: done
depends-on: WP-M6-19
phase: 6
milestone: m6
context-budget: 14k tokens
spec: specs/07-escalation.md §7.2; PLAN.md §3.1
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — the history rendering
- apps/web/src/features/tickets/__tests__/ticket-detail-report-time.test.tsx — the page test pattern
- apps/web/src/i18n/locales/de/ticket.json — the German labels
- apps/web/src/i18n/locales/en/ticket.json — the English labels

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — the escalation row
- apps/web/src/i18n/locales/de/ticket.json — the German label
- apps/web/src/i18n/locales/en/ticket.json — the English label

interfaces:

- an `escalated` event shows `Eskalation: <name>` and the description below it,
  in the language of the interface.
- i18n key `detail.escalationLabel` = `Eskalation: {{label}}` / `Escalation: {{label}}`.

## Task

1. `apps/web/src/features/tickets/ticket-detail-page.tsx`: read the name and the
   description of the stage from the event payload. The payload carries both
   languages, so the helper picks the one of the interface language; an event of
   an older installation carries neither and the history keeps the event label
   alone.
2. Render the name as `t('detail.escalationLabel', { label })` and the
   description below it, both in the muted style of the other event details.
3. Add `detail.escalationLabel` in `de` and `en`.
4. Add the page test: the history shows the German name and description and,
   after `i18n.changeLanguage('en')`, the English ones.

## Non-goals

- No change to the timeline bar (WP-M9-22) and to the public status page.
- No change to the event itself (WP-M6-19 writes the texts).
- No notification of the stage (the notifications of phase 7 are separate).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `de` and `en` stay symmetric.

## Handoff

- Files changed: the page, its new test and the two locale files
- Interfaces added: `detail.escalationLabel`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npx vitest run apps/web/src/features/tickets/__tests__/ticket-detail-escalation.test.tsx`
  (2 passed), `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
