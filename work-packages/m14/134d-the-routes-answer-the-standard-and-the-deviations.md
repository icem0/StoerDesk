# WP-M14-134d: the routes answer the standard and the deviations

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/08-objects-api.md §9.1; specs/02-data-model.md §4.3.2; ADR-0029
spec-lines: 25

depends-on: WP-M14-134c

files-read:

- apps/api/src/settings/deadlines.ts (the settings routes of ADR-0008)
- apps/api/src/index.ts (the registration of the routes)
- apps/api/src/objects/priority.ts (the priority module of WP-M14-134c)
- packages/shared/src/schemas/ticket-defaults.ts (the contracts)

files-write:

- apps/api/src/settings/ticket-defaults.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/settings/ticket-defaults` — `settings.read`, answers
  `{ priority }`
- `PUT /api/v1/settings/ticket-defaults` — `settings.write`, body `{ priority }`,
  stores the standard and prunes the rows that no longer deviate
- `GET /api/v1/settings/ticket-defaults/overrides` — `settings.read`, answers
  `{ overrides }` with the deviation of every object that deviates

## Task

1. Write `apps/api/src/settings/ticket-defaults.ts` with the three routes of
   the interfaces. The `PUT` stores the setting `ticket.default_priority` and
   deletes the rows of `object_priority_overrides` that now equal the new
   standard, in one transaction. A body outside the four priorities answers
   `400 invalid_request` with the field path, like the routes of
   `apps/api/src/settings/deadlines.ts`.
2. Register the routes in `apps/api/src/index.ts` next to the deadline routes.
3. Add integration tests: the standard is read, the `PUT` changes it, the rows
   that no longer deviate are gone, and a malformed body is rejected.

## Non-goals

- No administration page yet (WP-M14-134g, WP-M14-134h).
- No change of the deadline hours per priority (ADR-0008).
- No change of the object routes — they carry the priority since WP-M14-134c.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the standard is readable and writable, the deviations are
listed.

## Handoff

- Files changed: the new settings module, the registration of the routes
- Interfaces added: the three routes of the standard and of the deviations
- Verified: `npm run check` (exit 0), the integration spec of the routes
- Follow-up WP: WP-M14-134e (the ticket takes the priority of the object)
- Open question: none
