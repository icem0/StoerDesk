# WP-M14-134g: the administration shows the standard and the deviations

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.1; specs/02-data-model.md §4.3.2; ADR-0029
spec-lines: 25

depends-on: WP-M14-134f

files-read:

- apps/web/src/admin/escalation-page.tsx (the page of the deadline hours)
- apps/web/src/i18n/locales/de/settings.json (the labels of the administration)
- apps/web/src/features/objects/__tests__/ (the pattern of the page tests)
- apps/web/src/lib/api.ts (the fetch helper of the web app)

files-write:

- apps/web/src/admin/ticket-defaults-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `TicketDefaultsPage` — the page `/admin/defaults` of the administration
- The labels `admin.defaults.*` in `de` and `en`

## Task

1. Write `apps/web/src/admin/ticket-defaults-page.tsx`: the page shows the
   **standard** of the priority in a select over the four priorities and saves
   it through `PUT /api/v1/settings/ticket-defaults`. Below it the page lists
   the **deviations** of `GET /api/v1/settings/ticket-defaults/overrides` with
   the object number, the name and the priority of every object that deviates.
   A page without the permission `settings.read` says that it has no
   permission; without `settings.write` the standard is read-only.
2. Add the labels of the page in `de` and `en` under `admin.defaults`:
   `title`, `hint`, `standard`, `save`, `saved`, `deviations`, `deviationsHint`,
   `empty`, `errors.*`.
3. Add a page test: the page shows the standard of the answer, the list of the
   deviations and saves a new standard.

## Non-goals

- No route and no menu entry — WP-M14-134h mounts the page.
- No edit of a deviation in the list; the object form owns it (WP-M14-134f).
- No change of the deadline hours per priority (ADR-0008).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page shows the standard and the deviations.

## Handoff

- Files changed: the new page, the labels in `de` and `en`
- Interfaces added: `TicketDefaultsPage`
- Verified: `npm run check` (exit 0), the page test of the defaults proves the standard, the list, the save and the missing permission
- Follow-up WP: WP-M14-134h (the route and the menu entry of the defaults)
- Open question: none
