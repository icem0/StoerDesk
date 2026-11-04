format: small-model
status: implemented
depends-on: WP-M2-75
phase: 4
context-budget: 14k tokens
spec: PLAN.md §6, §15; specs/02-data-model.md §4.9 (context only)
spec-lines: 40

files-read:

- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0004_ticket_tables.sql
- PLAN.md §6
- docs/REPO-MAP.md

files-write:

- apps/api/src/db/schema.ts (`ticketPurges` table)
- apps/api/src/db/migrations/0012_ticket_purges.sql

interfaces:

- `ticketPurges` table: `id`, `ticketNo`, `objectNo`, `actorUserId`, `reason`,
  `deletedEventsCount`, `deletedPhotosCount`, `createdAt`

## Task

Add the append-only purge log of permanently deleted tickets. A hard-deleted
ticket removes itself from `tickets` (cascade takes `ticket_events` and
`ticket_photos` rows with it — the trigger of migration 0004 expressly permits
the cascade). `ticket_purges` keeps the accountability record: ticket number,
object number, deleting admin, optional reason, counts of removed events and
photos, deletion time. No reporter contact data, no ticket content.

1. Add the `ticketPurges` Drizzle table to `apps/api/src/db/schema.ts` (after
   `ticketPhotos`, before the export block).
2. Write the hand-written migration `apps/api/src/db/migrations/0012_ticket_purges.sql`
   creating the table plus an index on `created_at` (UUID v7 default from
   migration 0000).
3. Record `ticketPurges` in the public API of `docs/REPO-MAP.md` and add a
   `WP-M2-76` row to `PLAN.md` §16 and `work-packages/README.md`.

## Non-goals

- No service, no route, no UI (WP-M2-77 / WP-M2-78).
- No trigger on `ticket_purges` itself in this WP (kept deliberately small;
  append-only discipline is enforced by convention plus the migration comment).
- No photo file deletion yet (WP-M2-77).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green; `drizzle-kit` schema contains `ticketPurges`.

## Handoff

- Files changed: `apps/api/src/db/schema.ts`,
  `apps/api/src/db/migrations/0012_ticket_purges.sql`,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `work-packages/README.md`,
  `work-packages/m2/076-ticket-delete-purge-log.md`
- Interfaces added: `ticketPurges` table
- Verified: typecheck, lint, vitest, `npm run wp:check`
- Follow-up WP: WP-M2-77 `077-ticket-delete-api.md` (created in the same commit
  as this WP file)
- Open question: none
