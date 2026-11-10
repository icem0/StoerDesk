# WP-M2-98e: ticket detail shows report time, channel and reporter kind

format: small-model
status: implemented
depends-on: WP-M2-98d
phase: 2
context-budget: 22k tokens
spec: PLAN.md §6/§7 rule 1, specs/06-report-form.md §7.3.4
spec-lines: 50

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — info table and history
- packages/shared/src/schemas/ticket.ts — detail ticket and event payload
- apps/web/src/i18n/locales/de/ticket.json — `detail.field`, `status.events`
- apps/web/src/i18n/locales/en/ticket.json — `detail.field`, `status.events`
- apps/web/src/features/tickets/__tests__/ticket-timeline.test.tsx — render pattern

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — channel/kind and history
- apps/web/src/i18n/locales/de/ticket.json — German detail keys
- apps/web/src/i18n/locales/en/ticket.json — English detail keys
- apps/web/src/features/tickets/__tests__/ticket-detail-report-time.test.tsx — test

interfaces:

- info table gains `Kanal` and `Meldeart` when the `created` event payload
  carries `reporterChannel` / `reporterKind`; historic tickets without payload
  values show `–`
- history renders one extra row `Meldung gemeldet` at `ticket.reportedAt` when
  it differs from the `created` event by more than one minute
- channel labels are `Telefon` / `E-Mail` / `Messenger`; kind labels are
  `Interner Mitarbeiter` / `Externer Melder`

## Task

1. In `ticket-detail-page.tsx` read `ticket.reportedAt` and the `created`
   event payload. Extend the existing info table with two labelled cells for
   `Kanal` and `Meldeart`; unknown or legacy values render the existing `–`.
2. Add the synthetic history row for a backdated report above the `created`
   event (label `Meldung gemeldet`, time = `reportedAt`, actor = the reporter
   name when set). Keep the existing history map untouched for other events.
3. Add the German and English keys under `detail.field` and `status.events`.
4. Add a page-level test that renders a backdated ticket and expects the extra
   history row plus the channel label.

## Non-goals

- No API change, no migration.
- No edit of existing events, no change to the append-only rule.
- No list or dashboard change.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: all green, including `i18n:check` and the new page test.

## Handoff

- Files changed: detail page, both locale files, new test
- Interfaces added: the two info cells and the synthetic history row
- Verified: `npm run wp:check` green; `npm run check` green (DB integration skipped:
  role `stoerdesk` missing; e2e skipped: no Chromium)
- Follow-up WP: none
- Open question: none
