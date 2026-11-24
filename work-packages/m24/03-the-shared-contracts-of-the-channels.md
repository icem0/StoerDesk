# WP-M24-03: the shared contracts of the channels, the policy and the compliance

format: small-model
status: done
depends-on: WP-M24-02
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.3, §11.3a, §11.9, §11.11
spec-lines: 50

files-read:

- packages/shared/src/schemas/notification.ts (the contracts of the chapter)
- packages/shared/src/__tests__/notification.test.ts (the test of the contracts)
- apps/api/src/notifications/accounts.ts (the accounts of the user)

files-write:

- packages/shared/src/schemas/notification.ts
- packages/shared/src/__tests__/notification.test.ts
- apps/api/src/notifications/accounts.ts

interfaces:

- `channelPolicySchema` — `{ requiredChannels: NotificationChannelKind[], minimumChannelCount: number }`
- `notificationAccountSchema` — the account with `target`, `verifiedAt` and the state `missing | linked | ready`
- `notificationComplianceSchema` — per user the channels, the missing required channels, the count of the set-up channels and the flag `compliant`
- `notificationVerificationResponseSchema` — `{ expiresAt }` of the pending code
- `confirmNotificationVerificationRequestSchema` — `{ code }`

## Task

1. Add the contracts of the policy, of the account with its state and of the
   compliance to the shared schema of the notifications.
2. Add the contracts of the confirmation: the deadline of the pending code and
   the code the user copies.
3. Extend the service of the accounts so the answer of an account carries the
   target, the time of the confirmation and the state of the channel.
4. Extend the test of the contracts.

The contracts of the selection per event type leave the product with
WP-M24-06 — the code that reads them goes with them.

## Non-goals

- No route and no service in this WP.
- No change of the permissions.
- No UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the contracts knows the new schemas.

## Handoff

- Files changed: the shared schema, the test of the contracts, the service of
  the accounts
- Interfaces added: the five schemas above
- Verified: the commands above
- Follow-up WP: WP-M24-04 — the route of the policy of the administration
- Open question: none
