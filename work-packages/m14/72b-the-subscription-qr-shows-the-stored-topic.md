# WP-M14-72b: The subscription QR shows the stored topic

format: small-model
status: planned
depends-on: WP-M14-72
phase: 14
milestone: m14
context-budget: 16k tokens
spec: docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (points 6, 7)
spec-lines: 30

files-read:

- docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md
- apps/api/src/notifications/routes.ts (the `GET /api/v1/notifications/accounts/ntfy` route)
- apps/api/src/notifications/accounts.ts (`readAccount` of WP-M14-08)
- apps/api/src/notifications/__tests__/routes.unit.spec.ts (the subscription answer)

files-write:

- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/routes.unit.spec.ts

interfaces:

- the `GET /api/v1/notifications/accounts/ntfy` answer carries the stored
  `external_id` of the ntfy account of the session user

## Task

1. `GET /api/v1/notifications/accounts/ntfy` builds the subscription address from
   the stored topic of the ntfy account of the session user (`readAccount(database, userId, 'ntfy')`
   of WP-M14-08) — the derived `stoerdesk-<userId>` topic is no longer a valid
   subscription (WP-M14-72 removed the fallback in the routing, so a phone at a
   derived topic receives nothing).
2. A user without an ntfy account answers the address of a fresh random topic from
   `newNtfyTopic()` and provisions the account row through `storeAccount` —
   visiting the QR connects the user (ADR-0024 point 6: the QR carries the topic
   of the user, the server creates it).
3. A user who already has an account keeps its stored topic: a repeat visit never
   rotates it and writes nothing new.
4. The test seam stays: an unconfigured ntfy server answers the empty
   subscription as before.
5. Tests: the route spec proves the answer for a user with a stored topic, the
   provisioning for a user without an account (the stored row carries a
   `stoerdesk-`-prefixed random topic) and that a repeat visit keeps the stored
   topic.

## Non-goals

- No migration or rotation of existing topics; re-subscription is the operator's
  step (WP-M14-72 non-goal).
- No change of the adapters, the outbox or `receivers.ts`.
- No new route, no new permission key, no change of the session guard.

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the QR of a user without an account is a random topic and
the QR of a user with an account is the stored one.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: whether provisioning on the first QR visit is the right moment
  or the user should click a `Connect this device` action
