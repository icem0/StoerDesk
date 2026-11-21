# WP-M16-11a: the backend sort-direction setting

format: small-model
status: done
depends-on: WP-M16-02, WP-M16-11
phase: 16
milestone: m16
context-budget: 10k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 25

files-read:

- packages/shared/src/schemas/settings.ts
- apps/api/src/settings/branding.ts
- apps/api/src/settings/__tests__/branding.integration.spec.ts

files-write:

- packages/shared/src/schemas/settings.ts
- apps/api/src/settings/branding.ts
- apps/api/src/settings/__tests__/branding.integration.spec.ts

interfaces:

- `ticketSortDirection: z.enum(['asc', 'desc'])` in `brandingResponseSchema` and
  `displaySettingsResponseSchema`, optional in `updateBrandingRequestSchema`,
  plus `DEFAULT_TICKET_SORT_DIRECTION = 'desc'` and `TicketSortDirection`
- `GET /api/v1/settings/branding` and `GET /api/v1/settings/display` answer
  `ticketSortDirection`; `PUT /api/v1/settings/branding` keeps the stored value
  when the body omits it

## Task

1. `packages/shared/src/schemas/settings.ts` gains `ticketSortDirection` in the
   branding, display and update contracts, plus the default and the type.
2. `apps/api/src/settings/branding.ts` reads and returns the stored direction in
   both display responses (`storedTicketSortDirection`, default `'desc'`) and
   writes it in the PUT, keeping the stored value when the body omits it.
3. `apps/api/src/settings/__tests__/branding.integration.spec.ts` asserts
   `ticketSortDirection` in the branding response bodies.

## Non-goals

- No new database table or migration: the direction travels in the existing jsonb
  `branding` settings row.
- No frontend change: WP-M16-11b renders the checkbox and WP-M16-11c tests it.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run -- projects=api 2>/dev/null || npx vitest run apps/api/src/settings/__tests__/branding.integration.spec.ts
```

Expected: green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `packages/shared/src/schemas/settings.ts`,
  `apps/api/src/settings/branding.ts`,
  `apps/api/src/settings/__tests__/branding.integration.spec.ts`
- Interfaces added: `ticketSortDirection` in the shared settings contracts and in
  `GET /api/v1/settings/branding` and `GET /api/v1/settings/display`
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`
- Follow-up WP: WP-M16-11b, WP-M16-11c
- Open question: none
