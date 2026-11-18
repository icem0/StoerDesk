# WP-M14-134c: the service reads and writes the deviation

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/08-objects-api.md §9.1; specs/02-data-model.md §4.3.2; ADR-0029
spec-lines: 30

depends-on: WP-M14-134b

files-read:

- apps/api/src/objects/service.ts (the list, the read, the write)
- apps/api/src/objects/external.ts (the upsert of the external API)
- apps/api/src/db/schema.ts (the tables `objects`, `settings` and the new one)
- packages/shared/src/schemas/object.ts (the object schemas)

files-write:

- packages/shared/src/schemas/object.ts
- apps/api/src/objects/priority.ts
- apps/api/src/objects/service.ts
- apps/api/src/objects/external.ts

interfaces:

- `readStandardPriority(database): Promise<TicketPriority>` — the setting
  `ticket.default_priority`, `normal` without a row
- `readObjectPriority(database, objectId): Promise<TicketPriority>` — the
  deviation, else the standard
- `writeObjectPriority(tx, objectId, priority | null): Promise<void>` — stores
  the deviation or removes the row; a value that equals the standard removes
  the row
- `prunePriorityOverrides(tx, standard): Promise<number>` — deletes the rows
  that no longer deviate
- The object summary carries `priority` (the effective priority) and
  `priorityOverride` (the stored deviation, nullable); the object write accepts
  `priority` (nullable)

## Task

1. In `packages/shared/src/schemas/object.ts`, add the fields `priority` and
   `priorityOverride` to the object summary (both required, the deviation
   nullable) and the field `priority` (nullable, optional) to the object write.
   The field of the write is the deviation of the object: `null` removes it.
2. Write `apps/api/src/objects/priority.ts` with the four functions of the
   interfaces above. The standard is the row `ticket.default_priority` of the
   `settings` table; the deviation is the row of
   `object_priority_overrides`. A value that equals the standard is never
   stored.
3. In `apps/api/src/objects/service.ts`, the summary of an object carries the
   effective priority and the stored deviation; the create and the update write
   the deviation of the submitted `priority` — absent leaves it unchanged,
   `null` removes it.
4. In `apps/api/src/objects/external.ts`, the summary of the upsert carries the
   two priority fields as well. The external API sets no deviation: the
   priority is a decision of the office.
5. Add integration tests: an object without a deviation follows the standard, a
   deviation is stored, `null` removes it, and a value that equals the standard
   is not stored.

## Non-goals

- No route for the standard and no list of the deviations (WP-M14-134d).
- No change of the deadline hours per priority (ADR-0008).
- No change of the priority of a ticket (WP-M14-134e).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the object summary carries the effective priority and the
stored deviation.

## Handoff

- Files changed: the object schemas, the new priority module, the object
  service, the external upsert
- Interfaces added: `readStandardPriority`, `readObjectPriority`,
  `writeObjectPriority`, `prunePriorityOverrides`
- Verified: `npm run check` (exit 0), the integration specs of the object service
- Follow-up WP: WP-M14-134d (the routes answer the standard and the deviations)
- Open question: none
