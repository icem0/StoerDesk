# WP-M24-04: the route of the rule of the administration

format: small-model
status: planned
depends-on: WP-M24-03
phase: 24
milestone: m24
context-budget: 12k tokens
spec: specs/10-notifications.md §11.9, §11.11
spec-lines: 20

files-read:

- apps/api/src/settings/notifications.ts (the route of the mandatory channels)
- apps/api/src/notifications/channels/index.ts (the registry of the configured channels)

files-write:

- apps/api/src/settings/notifications.ts
- apps/api/src/settings/__tests__/notifications.integration.spec.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `GET /api/v1/settings/notifications/channel-policy` — the required channels and the minimum number
- `PUT /api/v1/settings/notifications/channel-policy` — replaces them

## Task

1. Replace the route of the mandatory channels of the critical tickets by the
   route of the rule: `GET` and `PUT /api/v1/settings/notifications/channel-policy`
   with the settings rows `notifications.required_channels` and
   `notifications.minimum_channel_count`.
2. Refuse a channel that is not configured and the channel `signal` with
   `422 invalid_request` — a requirement no user could ever fulfil is a lie.
3. Write the test of the route.

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
`signal` and of a channel that is not configured.

## Handoff

- Files changed: the route, the test, the shared schema
- Interfaces added: the two routes of the policy
- Verified: the commands above
- Follow-up WP: WP-M24-05 — the own accounts of the user with their state
- Open question: none
