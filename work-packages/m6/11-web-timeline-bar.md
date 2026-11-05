# WP-M6-11: web timeline bar and pause controls

format: small-model
status: planned
depends-on: WP-M6-10
phase: 6
milestone: m6
context-budget: 20k tokens
spec: specs/05-timeline.md §5.3–§5.4
spec-lines: 50

files-read:

- specs/05-timeline.md §5.3–§5.4
- apps/web/src/features/tickets/ticket-detail-page.tsx
- packages/shared/src/timeline.ts
- apps/web/src/i18n/locales/de/ticket.json (detail namespace)

files-write:

- apps/web/src/features/tickets/ticket-timeline.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `TicketTimeline` component: bar, markers, colour state, remaining time,
  pause/resume button and open-pause reason
- i18n keys `timeline.*` in the `ticket` namespace (de + en)
- the detail page posts `/pause` with `{ reason }` and `/resume`

## Task

1. Build the component from the shared `computeTicketTimeline`, refreshed every
   minute with a `setInterval`; it renders markers for the events the API sent.
2. Render the colours green/yellow/orange/red/stopped and the remaining time;
   a stopped bar names `acknowledgedAt`.
3. Add a pause button (prompt for reason) or resume button when a pause is open,
   hidden for `ACKNOWLEDGED`/`CLOSED`/`CANCELLED`; refetch after success.
4. Add all labels to `de` and `en`; no literal JSX text.

## Non-goals

- No offline pause.
- No list mini timeline (WP-M6-12).
- No escalation labels beyond the existing raw event history.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; de/en parity holds.

## Handoff

- Files changed: component, detail page, both locale files, component test
- Interfaces added: `TicketTimeline`, `timeline.*` keys
- Verified: typecheck, lint, test:run, i18n:check
- Follow-up WP: WP-M6-12 (list mini timeline)
- Open question: none
