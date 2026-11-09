# WP-M9-24: ticket view honours the branding title switch

format: small-model
status: done
depends-on: WP-M9-23
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §14 (branding settings); PLAN.md §6/§7 (ticket view); specs/01-rbac.md §3.2 (server is the enforcement point)
spec-lines: 50

files-read:

- apps/api/src/tickets/detail.ts — `getTicketDetail`, WP-M2-18a
- apps/api/src/settings/branding-state.ts — `readTitleEnabled`, WP-M9-23
- apps/api/src/settings/branding.ts — branding routes, WP-M2-29
- packages/shared/src/schemas/settings.ts — `brandingResponseSchema`, `updateBrandingRequestSchema`, WP-M2-89
- packages/shared/src/schemas/ticket.ts — `ticketDetailResponseSchema` (`title` nullable), WP-M2-18a

files-write:

- apps/api/src/tickets/detail.ts — `title` answered as `null` when the switch is off
- apps/api/src/settings/branding.ts — new `GET /api/v1/settings/title-switch` guarded by `ticket.create`
- packages/shared/src/schemas/settings.ts — new `titleSwitchResponseSchema`
- apps/api/src/tickets/__tests__/detail-title-gate.integration.spec.ts — new integration test

interfaces:

- `getTicketDetail(database, ticketNo)` — answers `ticket.title = null` when `titleEnabled` is off, the stored value otherwise; the DB row stays untouched, so re-enabling the switch shows stored titles again
- `GET /api/v1/settings/title-switch` — `ticket.create`, answers `{ titleEnabled: boolean }`; `reporter_internal` holds `ticket.create` but not `settings.read`, so `/api/v1/settings/branding` is not usable for the internal creation form
- `titleSwitchResponseSchema` / `TitleSwitchResponse` — `{ titleEnabled: z.boolean() }`

## Task

1. `apps/api/src/tickets/detail.ts`: inside `getTicketDetail`, read the flag with `readTitleEnabled(database)` and answer `title: titleEnabled ? ticketRow.title : null`. The server is the enforcement point (`specs/01-rbac.md` §3.2); the ticket detail page and the e-mail page both render a title only when `ticket.title !== null`, so both views honour the switch without any client change.
2. `packages/shared/src/schemas/settings.ts`: add `titleSwitchResponseSchema` answering `{ titleEnabled: boolean }` plus `TitleSwitchResponse`.
3. `apps/api/src/settings/branding.ts`: register `GET /api/v1/settings/title-switch` guarded by `ticket.create` next to the branding routes; it reuses `storedTitleEnabled` / `BRANDING_KEY` from `branding-state.ts`. The flag is already public through the QR resolve, so this route leaks nothing new.
4. `apps/api/src/tickets/__tests__/detail-title-gate.integration.spec.ts`: open test database, create one object and one ticket with a stored title; `branding` row missing → `title: null`; `titleEnabled: false` → `title: null`; `titleEnabled: true` → stored title; flipping the flag off and on again keeps the stored title in the DB and only changes what the API answers.

## Non-goals

- No change to the `created` event payload (audit history, not rendered in the UI).
- No client change in this WP; the detail gate is purely server-side.
- The internal creation form keeps showing its title field; WP-M9-25 reads the new route and hides the field while the switch is off.

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the new test fails before the change and passes after it. `npm run check` may skip the database drop gate for environmental reasons (role `stoerdesk` has `Create DB` but no process-termination permission) — that pre-exists on clean HEAD and is unrelated.

## Handoff

- Files changed: `apps/api/src/tickets/detail.ts`, `apps/api/src/settings/branding.ts`, `packages/shared/src/schemas/settings.ts`, new integration test, this WP doc
- Interfaces added: `getTicketDetail` title gating, `GET /api/v1/settings/title-switch`, `titleSwitchResponseSchema` / `TitleSwitchResponse`
- Verified: `wp:check`, typecheck, lint, `test:run`
- Follow-up WP: WP-M9-25 (internal creation form hides the title field while the switch is off, using the new route)
- Open question: none
