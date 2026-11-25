# WP-M35-03: The ticket overview opens on the open tickets

format: ctx-256k
status: done
depends-on: WP-M35-02
phase: 35
context-budget: 46k tokens
spec: specs/13-ui.md §14.9, specs/13-ui.md §14.12 (new), PLAN.md §14, PLAN.md §16
spec-lines: 120
changed-lines: 260

files-read:

- PLAN.md (§14, §16, §17)
- specs/13-ui.md (§14.9, §14.10)
- docs/REPO-MAP.md (the row of the ticket list)
- docs/DECISIONS.md
- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/features/tickets/**tests**/ticket-list-page.test.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- packages/shared/src/schemas/ticket.ts (ticketListQuerySchema)
- apps/api/src/tickets/list.ts

files-write:

- apps/web/src/features/tickets/ticket-list-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/features/tickets/**tests**/ticket-list-page.test.tsx
- specs/13-ui.md
- docs/DECISIONS/0059-the-ticket-overview-opens-open-and-the-filter-is-a-menu.md
- docs/DECISIONS.md
- PLAN.md
- CHANGELOG.md
- work-packages/README.md
- docs/REPO-MAP.md

interfaces:

- `GET /v1/tickets?open=true` — the default request of the overview (the API is untouched)
- `GET /v1/tickets` without `open` — only while „Erledigte anzeigen“ is checked
- `TicketListPage` at `/tickets` — the page state lives in the URL (`closed=true`)

## Task

The office asked for a cleaner ticket overview: „in der ticketübersicht sollen
in der Grundstellung nur die offenen zu sehen sein und die Option nur offene
muss weg und eine Checkbox erledigte anzeigen“; „ausserdem … der filter soll
ein Pulldownmenu … neben dem button Neue Meldung soll ein Button mit Filter“.

1. **The decision (ADR-0059).** The overview of `/tickets` opens **open only**:
   without a filter the page asks the API with `open=true`. The option „nur
   offene“ is gone; its inverse „Erledigte anzeigen“ is a checkbox that lets
   completed tickets into the list. The filters (search, status, priority,
   completed, overdue) live behind one **Filter button** beside „Neue Meldung“
   that pulls the filter menu down below the header. ADR and index row.
2. **The spec.** `specs/13-ui.md` gains §14.12 (the overview of the ticket list:
   the open default, the checkbox, the filter menu).
3. **The plan.** `PLAN.md` §14 carries the rule of the overview; §16 gets the
   status line of the out-of-band WP-M35-03.
4. **The page.** `TicketListPage` reads `closed=true` from the URL instead of
   `open=true` and asks the API for `open=true` while `closed` is not set. The
   header holds „Neue Meldung“ and the „Filter“ button side by side; the button
   toggles a filter card under the header that holds the search field, the two
   selects, the checkbox „Erledigte anzeigen“ and „nur überfällige“. The old
   filter row of five fields and the „nur offene“ checkbox are gone.
5. **The texts.** `list.filterOpen` is deleted in `de` and `en`; `list.filterClosed`
   („Erledigte anzeigen“ / „Show closed“), `list.filterButton` („Filter“ in both
   languages) and a hint that names the open default replace it in both
   locales.
6. **The tests.** The page test proves the new behaviour: the default request
   carries `open=true`, the closed menu holds no fields, the Filter button
   opens it, the checkbox „Erledigte anzeigen“ takes the completed ones in
   (the second request carries no `open`), and the rows, the order of the
   office and the links stay green.

## Non-goals

- No API change: `open` keeps its three states (absent, true, false); the
  external list and the saved dashboard views are untouched.
- No saved views („mine“, „pool“) and no new filter (a range filter stays out).
- No change of the rows, of the order of the office (§14.9) or of the mini
  timeline.
- No notification of the office; no settings surface.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected result: all green; the new cases of the page test fail before the
change and pass after it.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-list-page.tsx` (the
  open default, the filter menu behind the Filter button, the checkbox
  „Erledigte anzeigen“),
  `apps/web/src/features/tickets/__tests__/ticket-list-page.test.tsx` (the
  cases of the new behaviour),
  `apps/web/src/i18n/locales/de/ticket.json` and `.../en/ticket.json` (the
  option „nur offene“ is gone),
  `docs/DECISIONS/0059-the-ticket-overview-opens-open-and-its-filter-is-a-menu.md`
  (new), `specs/13-ui.md` (§14.12)
- Interfaces added: `list.filterButton` and `list.filterClosed` are used by the
  page (the texts existed already), the option `list.filterOpen` is gone
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`); the cases of the web app run green — except the case of the
  wall display, which fails in the container of the session because its Node
  formats the German numbers with an English separator (the case fails on
  `HEAD` as well, the CI runs Node 22)
- Follow-up WP: none — a remark that belongs to this feature stays a line here
- Open question: none
