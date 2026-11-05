format: small-model
status: pending
depends-on: WP-M2-87
phase: 2
context-budget: 14k tokens
spec: PLAN.md §6, PLAN.md §11
spec-lines: 30

files-read:

- apps/api/src/db/__tests__/migrations.spec.ts
- apps/api/src/db/__tests__/seedDemo.integration.spec.ts
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts
- apps/api/src/objects/__tests__/objects.integration.spec.ts

files-write:

- apps/api/src/db/__tests__/migrations.spec.ts
- apps/api/src/db/__tests__/seedDemo.integration.spec.ts
- apps/api/src/db/__tests__/ticketTables.integration.spec.ts
- apps/api/src/objects/__tests__/objects.integration.spec.ts

interfaces:

- `migrations.spec.ts`: removes assertion on `systems` table FK `system_id` → `systems(id)`.
- `seedDemo.integration.spec.ts`: removes demo system assertions.
- `ticketTables.integration.spec.ts`: removes `systemId` from ticket creation and system-delete assertions.
- `objects.integration.spec.ts`: removes `systems` assertions from object create/update.

## Task

Update API tests that referenced `systems` or `systemId`.

1. `migrations.spec.ts`: drop the `systems` table FK assertion.
2. `seedDemo.integration.spec.ts`: demo objects no longer have systems.
3. `ticketTables.integration.spec.ts`: tickets are created without `systemId`; system-delete cascade test removed.
4. `objects.integration.spec.ts`: object create/update no longer asserts `systems` arrays.

## Non-goals

- No new tests added.
- Web tests handled in WP-M2-88c.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run test:run
npm run wp:check
```

## Handoff

- Files changed: `apps/api/src/db/__tests__/migrations.spec.ts`, `apps/api/src/db/__tests__/seedDemo.integration.spec.ts`, `apps/api/src/db/__tests__/ticketTables.integration.spec.ts`, `apps/api/src/objects/__tests__/objects.integration.spec.ts`
- Follow-up WP: WP-M2-88b (API tests part 2)
- Open question: none
