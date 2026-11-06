# WP-M8-12: personal on-call iCal feed

format: small-model
status: planned
depends-on: WP-M8-05, WP-M8-06
phase: 8
milestone: m8
context-budget: 17k tokens
spec: specs/04-oncall.md §4a.7; ADR-0011 decision 5
spec-lines: 60

files-read:

- specs/04-oncall.md (§4a.7 personal iCal feed)
- docs/DECISIONS/0011-oncall-slot-model-and-swap-approval.md (decision 5)
- apps/api/src/config/env.ts (`SESSION_SECRET`)
- apps/api/src/oncall/routes.ts (route plugin from WP-M8-06)
- apps/api/src/db/schema.ts (`users.locale`, `oncall_shifts`)
- packages/shared/src/i18n/t.ts and `server.{de,en}.json` (server text rule)

files-write:

- apps/api/src/oncall/ical.ts
- apps/api/src/oncall/routes.ts
- packages/shared/src/i18n/server.de.json
- packages/shared/src/i18n/server.en.json

interfaces:

- `icalTokenFor(userId: string, secret: string): string`
- `verifyIcalToken(token: string, secret: string): string | null` (user id)
- `serializeIcal(shifts, locale): string`
- `GET /api/v1/oncall/ical/:token.ics` (public, no session)

## Task

1. `ical.ts` builds the token `<userId>.<base64url(HMAC-SHA256(userId, SESSION_SECRET))>`
   and verifies it with `timingSafeEqual`; a malformed or wrong token returns
   `null`.
2. Query the `PLANNED` and `CONFIRMED` shifts of the verified user from 30 days
   ago to 180 days ahead, join the pool name, and serialize RFC 5545 VEVENTs
   with UTC `DTSTART`/`DTEND`, a stable UID and escaped text fields (`,` `;`
   `\` and newlines).
3. `SUMMARY` and `DESCRIPTION` come from `t(user.locale, 'oncall.ical.*', …)`;
   add the `oncall.ical` keys to both server locale files. Unknown token or
   malformed signature answers `404 { code: 'ical_not_found' }`.
4. Add the route to `oncallRoutes` with `content-type: text/calendar; charset=utf-8`
   and no session guard; the token is the only authorization.
5. Unit tests for token round-trip, tampering and escaping; integration test for
   the range and the two shift states.

## Non-goals

- No UI link (WP-M8-14 shows the token URL).
- No write access, no shift creation.
- No per-pool feeds; the feed is per user (ADR-0011).
- No expiry or rotation beyond changing `SESSION_SECRET`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the iCal unit tests need no database, the integration test
skips without one.

## Handoff

- Files changed: the iCal module, the route plugin, both server locale files,
  plus tests
- Interfaces added: the token helpers, the serializer and the public route
- Verified: typecheck, lint, test:run, i18n:check
- Follow-up WP: WP-M8-14 (my-shifts page shows the URL)
- Open question: none
