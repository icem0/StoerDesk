# WP-M5-14: history actor names come from the directory, not the login

format: small-model
status: done
depends-on: WP-M5-13
phase: 5
milestone: m5
context-budget: 12k tokens
spec: PLAN.md §6 (IDs, timestamps), §3.1 (no raw technical values)
spec-lines: 15

files-read:

- apps/api/src/tickets/detail.ts — event mapping, `actorNames`, `recordedBy`
- apps/api/src/db/schema.ts — `users.givenName`, `users.familyName`, `tickets.reporterName`
- packages/shared/src/schemas/ticket.ts — `ticketDetailResponseSchema.events`

files-write:

- apps/api/src/tickets/detail.ts
- work-packages/m5/14-history-actor-names.md (this file)

interfaces:

- `events[].actorName` carries the full name of a user actor (given + family) or
  the reporter name of a `public` event, never the e-mail address; it stays
  `null` when neither exists.

## Task

The ticket detail timeline rendered `actorName`, but the API filled it with
`users.email`. The UI therefore showed `Nutzer (name@example.com)`.

1. Build `actorNames` from `givenName` + `familyName` and only store a non-empty
   full name. Drop the e-mail fallback so the address never reaches the UI.
2. For events with `actorKind === 'public'` (QR report, external comment),
   return `tickets.reporterName` as `actorName` — the name the reporter supplied.
   This is independent of `actorUserId`, which is `null` for public events.
3. Keep `recordedBy` and the internal `actorFullNames` map unchanged.

## Non-goals

- No schema or API route change.
- No change to the web rendering (WP-M5-15).
- No change to audit logs or other endpoints.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

The DB-backed integration tests only run with a database; without one they are
reported as skipped, not green.

## Handoff

- Files changed: `apps/api/src/tickets/detail.ts`
- Interfaces added: none; `actorName` semantics narrowed
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint` (0 errors, 7 pre-existing warnings), `npm run test:run` (469 passed, 445 integration tests skipped without a database), `npm run wp:check`
- Follow-up WP: WP-M5-15 (`m5/15-history-actor-rendering.md`)
- Open question: none
