# WP-M16-24: the order of the ticket list and the direction of the history

format: small-model
status: done
depends-on: WP-M16-11, WP-M16-11d
phase: 16
milestone: m16
context-budget: 14k tokens
spec: specs/13-ui.md §14.9; specs/05-timeline.md §5.4; PLAN.md §16
spec-lines: 40

files-read:

- PLAN.md (§14 user interface, §16 phase roadmap, §17 work-package limits)
- specs/13-ui.md (the slice of chapter 14)
- specs/05-timeline.md (§5.4 the API representation of the list)
- apps/api/src/tickets/list.ts (the order of the list)
- packages/shared/src/schemas/settings.ts (the direction of the branding row)

files-write:

- specs/13-ui.md (§14.9, the order of the list and the direction of the history)
- specs/05-timeline.md (§5.4, the order of the office)
- work-packages/m16/ (WP-M16-24a … WP-M16-24d, each file created in this commit),
  work-packages/README.md and CHANGELOG.md
- PLAN.md (§16 the record of the split)

interfaces:

- `GET /api/v1/tickets` with `order=priority` — the order of the office: the open
  tickets first, then the urgency descending, then the nearest deadline, then
  the ticket number
- `historySortDirection` (`'asc' | 'desc'`, default `'desc'`) in the branding row
  and in `GET /api/v1/settings/display` — the direction of the history of a ticket
- `branding.field.historySortDirection` and `branding.hintHistorySortDirection` in
  `de` and `en`

## Task

**The comment of the office.** „die einstellung in der darstellung soll den
verlauf im ticket sortieren, nicht die liste der tickets. die liste der tickets
soll nach dringlichkeit sortiert werden, die höchste dringlichkeit zuerst.“

The office reads the switch „Neueste zuerst“ under „Darstellung“ and expects
the **history** of a ticket to follow it — not the list of the tickets. The
list itself has to be ordered by the urgency.

This package is the **spec and the split** — it writes no product code:

1. `specs/13-ui.md` gains §14.9: the order of the list at `/tickets` is the
   order of the office (the open tickets first, then the urgency descending,
   then the nearest deadline, then the ticket number) and the switch under
   „Darstellung“ steers the history of a ticket (`historySortDirection`).
2. `specs/05-timeline.md` §5.4 names the order of the office next to the order
   by the deadline and states that the `direction` parameter does not change it.
3. `PLAN.md` §16 gains the record of the change.
4. Create the work packages in `work-packages/m16/` in numeric order:
   **WP-M16-24a** (the API orders the list), **WP-M16-24b** (the list page asks
   for that order), **WP-M16-24c** (the contract and the pages follow the
   renamed direction) and **WP-M16-24d** (the texts of the switch name the
   history).
5. Record the phase in `work-packages/README.md` (the backlog rows) and in
   `CHANGELOG.md`.

## Non-goals

- No schema, route, page, component or test code in this package.
- No new table and no migration: the direction travels in the existing jsonb
  `branding` row; the API reads the old key of a row of an older version.
- No change of the dashboard, of the wall display and of the external API: the
  external list keeps its own order (`reportedAt`).
- No per-user preference: the direction is an instance value under „Darstellung“.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with the four new WP files valid; `check` green,
because this package changes documentation only. No Docker gate is part of this
WP.

## Handoff

- Files changed: `specs/13-ui.md`, `specs/05-timeline.md`, `PLAN.md` §16, the m16
  WP files, `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the contracts above — the order of the list, the direction of
  the history and the two texts of the switch
- Verified: `npm run wp:check` and `npm run check`
- Follow-up WP: WP-M16-24a, WP-M16-24b, WP-M16-24c, WP-M16-24d (each file exists
  in this commit)
- Open question: none
