format: small-model
status: pending
depends-on: WP-M2-82
phase: 2
context-budget: 12k tokens
spec: PLAN.md §6, PLAN.md §11
spec-lines: 30

files-read:

- apps/api/src/objects/service.ts
- apps/api/src/objects/qr.ts

files-write:

- apps/api/src/objects/service.ts
- apps/api/src/objects/qr.ts

interfaces:

- `service.ts`: removes `SystemRow` type, `loadSystems`, `syncSystems`, `systemValues`; `summarize` returns no `systems`; `listObjects`/`getObject` no longer load systems.
- `qr.ts`: removes `systems` import; `publicObject` returns no `systems` array.

## Task

Remove the system level from the object API.

1. `service.ts`: object list/detail/ create/update no longer carry a `systems` array. `syncSystems` and `loadSystems` are deleted. `summarize` builds an `ObjectSummary` without systems.
2. `qr.ts`: `publicObject` resolves the QR token to an object without loading systems; `publicQrObject` has no `systems` field.

## Non-goals

- No new endpoint for systems.
- `external_type` on objects stays unchanged.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

## Handoff

- Files changed: `apps/api/src/objects/service.ts`, `apps/api/src/objects/qr.ts`
- Follow-up WP: WP-M2-84 (Web report form)
- Open question: none
