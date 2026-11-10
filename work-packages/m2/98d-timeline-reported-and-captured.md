# WP-M2-98d: timeline shows report time and capture time

format: small-model
status: implemented
depends-on: WP-M2-98c
phase: 2
context-budget: 20k tokens
spec: specs/05-timeline.md §5.1/§5.3, PLAN.md §9
spec-lines: 60

files-read:

- apps/web/src/features/tickets/ticket-timeline.tsx — bar, ticks, markers
- apps/web/src/features/tickets/ticket-detail-page.tsx — timeline call
- apps/web/src/features/tickets/__tests__/ticket-timeline.test.tsx — props
- packages/shared/src/schemas/ticket.ts — `timeline` and `ticket.receivedAt`
- apps/web/src/i18n/locales/de/ticket.json — `timeline`
- apps/web/src/i18n/locales/en/ticket.json — `timeline`

files-write:

- apps/web/src/features/tickets/ticket-timeline.tsx — received-at label and marker
- apps/web/src/features/tickets/ticket-detail-page.tsx — pass receivedAt
- apps/web/src/i18n/locales/de/ticket.json — German timeline keys
- apps/web/src/i18n/locales/en/ticket.json — English timeline keys

interfaces:

- `TicketTimeline` gains `receivedAt: string`
- the header shows `Gemeldet am` (backdatable `reportedAt`) and
  `Erfasst am` (`receivedAt`, server capture time)
- when `reportedAt` differs from the `created` event by more than one minute, a
  `reported` marker sits on the left end of the bar; the `created` marker stays
  at the capture time
- normal reports (same minute) render exactly one `created` marker as before

## Task

1. `ticket-timeline.tsx`: add the `receivedAt` prop, format it like the other
   stamps and render an `Erfasst am` line under `Gemeldet am`.
2. Add the reported marker in `ticket-detail-page.tsx` before passing markers:
   derive the `created` event, compare its `createdAt` with `ticket.reportedAt`,
   and prepend `{ type: 'reported', at: ticket.reportedAt }` only when the
   difference exceeds 60 seconds. Pass `ticket.receivedAt` to the timeline.
3. Add `timeline.reportedAtLabel`-adjacent keys `timeline.capturedAtLabel` and
   `status.events.reported` in both locales (`Gemeldet` / `Reported`).
4. Extend `ticket-timeline.test.tsx`: the capture label renders and a
   `reported` marker appears at the start for a backdated report.

## Non-goals

- No API change: `receivedAt` and the `created` event already exist.
- No history line with the report time (WP-M2-98e).
- No new timeline algorithm, no database write.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: all green, including `i18n:check` and the timeline test.

## Handoff

- Files changed: timeline component, detail page, both locale files
- Interfaces added: `receivedAt` prop and the `reported` marker
- Verified: `npm run wp:check`, `npm run check`
- Follow-up WP: WP-M2-98e
- Open question: none
