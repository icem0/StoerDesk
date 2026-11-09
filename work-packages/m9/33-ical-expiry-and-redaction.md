# WP-M9-33: iCal feed expiry + log redaction (SEC-005, SEC-011)

format: small-model
status: done
depends-on: WP-M9-32
phase: 9
milestone: m9
context-budget: 12k tokens
spec: PLAN.md §15 (audit — SEC-005, SEC-011); specs/09-offline.md §9.x (on-call iCal)
spec-lines: 22

files-read:

- apps/api/src/oncall/ical.ts (verifyIcalToken, icalTokenFor, signatureFor)
- apps/api/src/oncall/routes.ts (GET /api/v1/oncall/ical/:token.ics handler)
- apps/api/src/auth/requirePermission.ts (loadEffectivePermissions)

files-write:

- apps/api/src/oncall/ical.ts
- apps/api/src/oncall/routes.ts

interfaces:

- `signatureFor` folds a rolling 1-year bucket into the HMAC (bucket format unchanged
  on the wire: `<userId>.<base64url HMAC>`); `verifyIcalToken` accepts the current
  and the previous bucket, so a token has ~2 years max age without a DB row per feed.
- The route handler filters `users.active = true`, re-checks `PERMISSIONS.oncall.read`
  via `loadEffectivePermissions` and answers the feed with `Cache-Control: no-store`.
- The route carries `config: { logLevel: 'warn' }` so Fastify stops writing every
  access log line for the feed at the default `info` level.

## Task

1. `apps/api/src/oncall/ical.ts`: introduce `IcalTokenBucketMs` and `IcalTokenMaxAgeBuckets`;
   `signatureFor(userId, secret, bucket)` HMAC-inputs `${userId}.${bucket}`; `icalTokenFor`
   takes an optional `now = Date.now()`; `verifyIcalToken` tries `bucket` and `bucket - 1`.
2. `apps/api/src/oncall/routes.ts`: in the iCal handler add `and(eq(users.id, userId), eq(users.active, true))`
   to the user select, run `loadEffectivePermissions(database, userId)` and require
   `PERMISSIONS.oncall.read`; pass `reply.header('cache-control', 'no-store')`; add
   `{ config: { logLevel: 'warn' } }` to the route options.

## Non-goals

- No DB migration, no schema change, no UI change.
- The capability URL shape (`/api/v1/oncall/ical/<token>.ics`) stays; the token stays 2-part.

## Acceptance

```bash
npm run check
```

## Handoff

- Files changed: the two above
- Interfaces added: none
- Verified: `npm run check`
- Follow-up WP: WP-M9-34 (`SESSION_SECRET` min length + logout cookie presence, SEC-016 / SEC-006)
- Open question: none
