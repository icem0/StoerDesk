# WP-M9-22: milestone markers on the timeline bar

format: small-model
status: done
depends-on: WP-M9-21
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §9, §14; specs/05-timeline.md §5.3
spec-lines: 30

files-read:

- PLAN.md (§9 timeline, §14 user interface)
- specs/05-timeline.md (§5.3 calculation, colours and markers)
- apps/web/src/features/tickets/ticket-timeline.tsx
- apps/web/src/features/tickets/__tests__/ticket-timeline.test.tsx
- apps/web/src/features/tickets/ticket-detail-page.tsx (the caller of the component)
- apps/web/src/i18n/locales/de/ticket.json (the timeline labels)

files-write:

- apps/web/src/features/tickets/ticket-timeline.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- specs/05-timeline.md

interfaces:

- `TicketTimeline` — the milestone markers are dots centered on the bar and on their
  own time position; the tooltip names the milestone in the language of the interface
- i18n key `timeline.markerTitle` in the `ticket` namespace (de + en)

## Task

1. Draw the milestone markers in an overlay next to the bar instead of inside the
   clipped bar box: every dot is centered on its time position (`translate(-50%, -50%)`)
   and on the bar itself, so the report marker is a full circle on the start point of
   the axis instead of a half dot above it. The overlay is not clipped, so the first and
   the last marker stay whole.
2. Give the dots a white core with a dark ring and a shadow: they stay readable on
   the green, yellow, orange and red fill and on the empty track, and the milestone
   is never conveyed by colour alone.
3. Name the milestone in the tooltip of the dot and of the deadline tick — the label
   of the event (`status.events.*`) and the formatted time in the new key
   `timeline.markerTitle` — instead of the machine key and the raw ISO string. The
   tick of the deadline gets the same treatment and is no longer clipped at the end
   of the axis.
4. Align the scale of the axis: the first label starts at the start point and the
   last label ends at the end point, so no number of the axis hangs half outside.
   All timestamps of the component use the language of the interface.
5. Extend the component test: the report marker sits at `0 %`, is centered on the
   bar, is not inside the clipped box of the bar and carries the localized label.
6. Document the representation in `specs/05-timeline.md` §5.3: the markers are dots
   on the bar, centered on their own time position, and the report marker is the
   start point of the axis.

## Non-goals

- No new marker types, no legend and no change of the API contract.
- No change of the mini timeline of the list and of the public status page.
- No change of the calculation of the timeline.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the marker of the report is a whole dot on the start point of
the bar and its tooltip names the milestone in German and in English.

## Handoff

- Files changed: the timeline component, both ticket locale files, the timeline spec,
  the component test
- Interfaces added: the i18n key `timeline.markerTitle` (de + en)
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: none
- Open question: none
