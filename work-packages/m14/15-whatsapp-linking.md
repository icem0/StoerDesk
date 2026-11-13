# WP-M14-15: The chats of the bridge and the WhatsApp Web account

format: small-model
status: done
depends-on: WP-M14-14
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.3, §11.6, §11.11, §11.12; PLAN.md §12
spec-lines: 50

files-read:

- specs/10-notifications.md §11.3, §11.6, §11.11
- apps/api/src/notifications/accounts.ts (the service of WP-M14-08)
- apps/api/src/notifications/routes.ts (the routes of the phase)
- apps/web/src/settings/notifications-page.tsx (the own channels page)
- apps/web/src/i18n/locales/de/common.json

files-write:

- apps/api/src/notifications/whatsapp-linking.ts
- apps/api/src/notifications/routes.ts
- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- `GET /api/v1/notifications/accounts/whatsapp/status` — the chats of the bridge
- `POST /api/v1/notifications/accounts/whatsapp` — the chat id of the user
- `readBridgeStatus(config): Promise<BridgeStatus>`

## Task

1. `apps/api/src/notifications/whatsapp-linking.ts` reads the chats of the
   bridge with `GET {baseUrl}/status`; a bridge that is not reachable answers
   `{ connected: false, chats: [] }` and never an error of the administration.
2. The route `POST /api/v1/notifications/accounts/whatsapp` stores the chat id
   that the user picked as the account of the user; the chat id must be one of
   the chats of the bridge, otherwise the answer is `422 invalid_request`.
3. The own channels page shows the section of WhatsApp Web: the state of the
   bridge, the list of its chats, the account of the user and the button to
   remove it.
4. The texts are added in `de` and `en`.

## Non-goals

- No pairing inside StörDesk: the pairing happens in the bridge (ADR-0020).
- No change of the adapter of WP-M14-14.
- No reply of a chat — the channel writes notifications only.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a mocked bridge answers its chats, the account is stored
and a chat that the bridge does not know is refused.

## Handoff

- Files changed: the new linking module, the routes, the own channels page, the
  two locale files and the tests
- Interfaces added: the two routes of the WhatsApp Web account
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-16 — the selection of the channels per event type
- Open question: none
