# WP-M14-134b: the contracts of the priority and of the standard

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/08-objects-api.md §9.1; specs/02-data-model.md §4.3.2; ADR-0029
spec-lines: 30

depends-on: WP-M14-134a

files-read:

- packages/shared/src/schemas/object.ts (the object schemas)
- packages/shared/src/schemas/deadlines.ts (the settings contract of ADR-0008)
- packages/shared/src/schemas/index.ts (the exports of the schemas)
- packages/shared/src/timeline.ts (the four priorities)

files-write:

- packages/shared/src/schemas/ticket-defaults.ts
- packages/shared/src/schemas/index.ts

interfaces:

- `ticketPrioritySchema` — `z.enum(['low', 'normal', 'high', 'critical'])`
- `ticketDefaultsSchema` — `{ priority }`; the body of `PUT` and the answer of
  `GET /api/v1/settings/ticket-defaults`
- `objectPriorityOverrideSchema` — `{ objectId, objectNo, objectName, priority }`;
  one deviation of the administration page
- `objectPriorityOverrideListSchema` — `{ overrides }`

## Task

1. Write `packages/shared/src/schemas/ticket-defaults.ts` with the contracts of
   ADR-0029: the schema `ticketPrioritySchema` over the four priorities, the
   schema `ticketDefaultsSchema` for the standard, the schema
   `objectPriorityOverrideSchema` for one deviation (the uuid of the object, its
   number, its name and the priority) and the schema
   `objectPriorityOverrideListSchema` for the list of the deviations.
2. Export the new file in `packages/shared/src/schemas/index.ts`.
3. Add a unit test of the shared package that proves the four priorities are
   accepted and an unknown priority is rejected.

The contracts carry no consumer yet: the object summary and the object write
learn the priority in WP-M14-134c, the routes answer them in WP-M14-134d.

## Non-goals

- No change of the object summary or of the object write (WP-M14-134c).
- No change of the deadline settings of ADR-0008.
- No change of the internal ticket request — its priority becomes optional in
  WP-M14-134e.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new schemas are exported by the shared package.

## Handoff

- Files changed: the new schema file, the index of the schemas
- Interfaces added: `ticketPrioritySchema`, `ticketDefaultsSchema`,
  `objectPriorityOverrideSchema`, `objectPriorityOverrideListSchema`
- Verified: `npm run check` (exit 0), the unit spec of the shared package
- Follow-up WP: WP-M14-134c (the service reads and writes the deviation)
- Open question: none
