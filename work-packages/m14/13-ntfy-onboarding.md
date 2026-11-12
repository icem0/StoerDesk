# WP-M14-13: The ntfy onboarding with the QR of the subscription

format: small-model
status: planned
depends-on: WP-M14-10
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.1, §11.3, §11.12; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.1, §11.3, §11.12
- apps/web/src/features/settings/NtfySubscription.tsx (the card of WP-M7-03)
- apps/api/src/notifications/channels/ntfy.ts (the adapter)
- apps/api/src/notifications/routes.ts (the routes of the phase)

files-write:

- apps/api/src/notifications/channels/ntfy.ts
- apps/api/src/notifications/routes.ts
- apps/web/src/features/settings/NtfySubscription.tsx
- apps/web/src/settings/notifications-page.tsx

interfaces:

- `GET /api/v1/notifications/accounts/ntfy` — the subscription address of the user
- the topic of a user: `stoerdesk-<userId>`

## Task

1. The topic of a user is derived from the user id (`stoerdesk-<userId>`); the
   ntfy adapter sends to the topic of the account of the user, when the user has
   one, and to the topic of the configuration otherwise.
2. The route `GET /api/v1/notifications/accounts/ntfy` answers the public
   subscription address of the user and the deep link `ntfy://<topic>`; the
   answer is empty when the ntfy server is not configured.
3. The card `NtfySubscription` of WP-M7-03 — so far without a place in the app —
   is mounted in the own channels page and gets the address of the API instead
   of the build-time constants; the build-time constants stay the fallback.
4. A unit test proves that the topic of a user is derived from the user id and
   that the adapter prefers the topic of the account.

## Non-goals

- No change of the payload of the ntfy adapter beyond the urgency of
  WP-M14-07.
- No push registration of the browser — that is the Web Push onboarding and it
  is not a part of this phase.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the card shows the subscription address of the user and
the adapter sends to the topic of the account.

## Handoff

- Files changed: the ntfy adapter, the routes, the QR card, the own channels
  page and the tests
- Interfaces added: the route of the ntfy subscription
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-14 — the WhatsApp Web bridge
- Open question: none
