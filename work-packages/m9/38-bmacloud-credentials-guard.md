# WP-M9-38: BMAcloud credentials GET guard (SEC-009)

format: small-model
status: done
depends-on: WP-M9-37
phase: 9
milestone: m9
context-budget: 6k tokens
spec: PLAN.md §15 (audit — SEC-009); specs/10-integrations.md §x.x (BMAcloud credentials)
spec-lines: 12

files-read:

- apps/api/src/integrations/bmacloud/routes.ts (credentials GET, PUT, DELETE)
- packages/shared/src/permissions.ts (PERMISSIONS.object.read / import)

files-write:

- apps/api/src/integrations/bmacloud/routes.ts

interfaces:

- `GET /api/v1/admin/bma-sync/credentials` is guarded by `PERMISSIONS.object.import`
  (PUT and DELETE already were).

## Task

1. `apps/api/src/integrations/bmacloud/routes.ts`: change the credentials GET guard
   from `PERMISSIONS.object.read` to `PERMISSIONS.object.import`.

## Non-goals

- No change to PUT/DELETE (already `object.import`).
- No UI change; the admin users/roles page keeps the display.
- No permission catalog change; both keys already exist.

## Acceptance

```bash
npm run check
```

## Handoff

- Files changed: the one above
- Interfaces added: none
- Verified: `npm run check`
- Follow-up WP: none — the phase 9 audit chain is closed
- Open question: none
