# WP-M9-25: internal creation form honours the branding title switch

format: small-model
status: done
depends-on: WP-M9-24
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §14 (branding settings); PLAN.md §7 rule 1 (internal capture); specs/01-rbac.md §3.2 (server is the enforcement point)
spec-lines: 40

files-read:

- apps/web/src/features/tickets/internal-create-page.tsx — the internal capture form, WP-M2-16
- apps/web/src/features/tickets/report-form-page.tsx — the public form that already gates its title field, WP-M2-90c
- apps/api/src/settings/branding.ts — `GET /api/v1/settings/title-switch`, WP-M9-24
- packages/shared/src/schemas/settings.ts — `titleSwitchResponseSchema`, WP-M9-24
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx — the page test
- apps/web/src/i18n/locales/de/ticket.json — the label of the field

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx
- work-packages/m9/25-internal-create-title-gate.md

interfaces:

- `GET /api/v1/settings/title-switch` (WP-M9-24) — `ticket.create`, answers `{ titleEnabled: boolean }`
- `TitleSwitchResponse` — `{ titleEnabled: z.boolean() }` (shared, WP-M9-24)
- `InternalCreatePage` — renders the title input only while `titleEnabled` is true and sends the title only then

## Task

1. `apps/web/src/features/tickets/internal-create-page.tsx`: read the switch with a
   `useQuery` over `GET /v1/settings/title-switch` (query key `title-switch`) and
   derive `titleEnabled = data?.titleEnabled === true`. A missing, pending or
   failed answer means **off**: the title input stays hidden, so the office
   never sees a field it may not fill in.
2. Render the title field of the form only while `titleEnabled` is true. The
   label and the input leave the DOM together — a hidden field is no field.
3. Send the title only while the switch is on: the payload carries
   `title: undefined` while it is off, so a stale value of the state can never
   reach the server. The server drops the title anyway (WP-M2-95); the client
   does not even offer it.
4. Extend the page test: with `titleEnabled: false` the form has no title
   input, with `titleEnabled: true` it has one and the submit body carries the
   typed title.

## Non-goals

- No change of the server: the create path already drops the title while the
  switch is off (WP-M2-95) and the detail view already hides it (WP-M9-24).
- No new route, no new schema, no migration, no i18n change.
- No change of the public report form — it gates its title field since
  WP-M2-90c.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the internal create page, its test, this WP document
- Interfaces added: none (the route and the schema exist since WP-M9-24)
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: none
- Open question: none
