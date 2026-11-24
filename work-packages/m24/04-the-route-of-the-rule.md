# WP-M24-04: the route of the rule of the administration

format: small-model
status: done
depends-on: WP-M24-03
phase: 24
milestone: m24
context-budget: 12k tokens
spec: specs/10-notifications.md §11.9, §11.11
spec-lines: 20

files-read:

- apps/api/src/settings/notifications.ts (the route of the mandatory channels)
- apps/api/src/notifications/channels/index.ts (the registry of the configured channels)
- apps/api/src/settings/__tests__/notifications.integration.spec.ts (the test of the route)

files-write:

- apps/api/src/settings/notifications.ts
- apps/api/src/settings/__tests__/notifications.integration.spec.ts

interfaces:

- `GET /api/v1/settings/notifications/channel-policy` — the required channels and the minimum number
- `PUT /api/v1/settings/notifications/channel-policy` — replaces them
- `notifications.required_channels` — the settings row of the required channels
- `notifications.minimum_channel_count` — the settings row of the minimum number

## Task

1. Add the route of the rule: `GET` and `PUT
   /api/v1/settings/notifications/channel-policy` behind `settings.read` and
   `settings.write`, with the two settings rows
   `notifications.required_channels` and `notifications.minimum_channel_count`.
2. Refuse a channel that is not configured and the channel `signal` with
   `422 invalid_request` — a requirement no user could ever fulfil is a lie.
3. Write the test of the route: the empty rule, the stored rule, the refusal
   of an unconfigured channel, of `signal` and of a negative minimum number.

The route of the former setting (the mandatory channels of the critical
tickets) stays until the administration page reads the new rule — WP-M24-18.

## Non-goals

- No UI.
- No compliance of the users — WP-M24-15.
- No change of the delivery.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test proves the refusal of an unknown channel, of
`signal` and of a negative minimum number.

## Handoff

- Files changed: the route, the test
- Interfaces added: the two routes of the policy, the two settings rows
- Verified: the commands above
- Follow-up WP: WP-M24-05 — the own accounts of the user with their state
- Open question: none
