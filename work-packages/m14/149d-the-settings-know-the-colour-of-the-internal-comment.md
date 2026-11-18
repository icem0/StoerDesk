# WP-M14-149d: the settings know the colour of the internal comment

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 14k tokens
spec: docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md; PLAN.md §14
spec-lines: 20

depends-on: WP-M14-149c

files-read:

- packages/shared/src/schemas/settings.ts (the contract of the branding)
- apps/api/src/settings/branding.ts (the row of the Darstellung)
- apps/api/src/settings/branding-state.ts (the reader of the row)

files-write:

- packages/shared/src/schemas/settings.ts
- apps/api/src/settings/branding.ts
- apps/api/src/settings/__tests__/branding.integration.spec.ts

interfaces:

- `brandingResponseSchema` — the answer carries `internalCommentColor`
- `updateBrandingRequestSchema` — the body carries `internalCommentColor`
- `displaySettingsResponseSchema` — `{ internalCommentColor }`
- `GET /api/v1/settings/display` (`ticket.read`) — the colour for the ticket view
- `PUT /api/v1/settings/branding` (`settings.write`) — the colour of the row

## Task

1. `packages/shared/src/schemas/settings.ts`: the answer of the branding and the
   body of the update gain the field `internalCommentColor` — a hex value of
   the form `#rrggbb`. The new schema `displaySettingsResponseSchema` answers
   the colour alone; it is the answer of the route the ticket view reads.
2. `apps/api/src/settings/branding.ts`: the row of the branding carries the
   colour; a row without the field answers the default `#7f1d1d` (a dark red),
   so an installation that never configured a colour shows the dark red. The
   update writes the colour of the body.
3. The same file: the new route `GET /api/v1/settings/display` behind
   `requirePermission(database, PERMISSIONS.ticket.read)` answers
   `{ internalCommentColor }`. Every colleague who may read a ticket may read a
   colour of the presentation — the route needs no `settings.read`.
4. The integration test: the default of a fresh row, the answer of the update,
   the answer of the route for a colleague with `ticket.read` and the
   `403 forbidden` for a colleague without it.

## Non-goals

- No new table, no migration: the colour is a field of the existing row.
- No page: the administration page follows in WP-M14-149e.
- No change of the logo, the company name and the title switch.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the shared contract, the settings module of the branding, its
  integration test, the security plan, this document, the backlog, the changelog,
  `PLAN.md` §16
- Interfaces added: `displaySettingsResponseSchema`, the route
  `GET /api/v1/settings/display`, the field `internalCommentColor`
- Verified: `npm run check`
- Follow-up WP: WP-M14-149e (the colour under „Darstellung“)
- Open question: none
