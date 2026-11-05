format: small-model
status: pending
depends-on: WP-M2-80
phase: 2
context-budget: 10k tokens
spec: PLAN.md §6, PLAN.md §11
spec-lines: 30

files-read:

- packages/shared/src/schemas/object.ts
- packages/shared/src/schemas/ticket.ts

files-write:

- packages/shared/src/schemas/object.ts
- packages/shared/src/schemas/ticket.ts

interfaces:

- `object.ts`: removes `OBJECT_SYSTEM_TYPES`, `objectSystemTypeSchema`, `objectSystemInputSchema`, `objectSystemSummarySchema`; removes `systems` field from `objectSummarySchema` and `publicQrObjectSchema`; removes `systems` from `createObjectRequestSchema` and `updateObjectRequestSchema`.
- `ticket.ts`: removes `systemId` from `publicReportRequestSchema`, `publicOpenTicketsQuerySchema`, `internalCreateTicketRequestSchema`; removes `systemType`/`systemLabel` from `ticketListItemSchema` and `ticketDetailResponseSchema`.

## Task

Remove all system-level references from the shared Zod schemas so the API contract no longer carries systems.

1. `packages/shared/src/schemas/object.ts`: drop the system types, input and summary schemas; drop `systems` arrays from object summaries and the public QR object; drop `systems` from create/update request schemas.
2. `packages/shared/src/schemas/ticket.ts`: drop `systemId` from the public report, public open tickets and internal create request schemas; drop `systemType`/`systemLabel` from ticket list and detail responses.

## Non-goals

- No new system field on tickets.
- No i18n changes here (WP-M2-87).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

## Handoff

- Files changed: `packages/shared/src/schemas/object.ts`, `packages/shared/src/schemas/ticket.ts`
- Follow-up WP: WP-M2-82 (API tickets)
- Open question: none
