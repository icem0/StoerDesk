# WP-M14-14: The WhatsApp Web bridge as a channel

format: small-model
status: planned
depends-on: WP-M14-04
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.1, §11.6; PLAN.md §12; ADR-0020
spec-lines: 40

files-read:

- specs/10-notifications.md §11.1, §11.6
- docs/DECISIONS/0020-whatsapp-web-over-an-external-bridge.md
- apps/api/src/notifications/channels/index.ts (the registry)
- apps/api/src/notifications/channels/telegram.ts (the pattern of an adapter)
- apps/api/src/config/env.ts, .env.example (the keys of the channels)

files-write:

- apps/api/src/notifications/channels/whatsapp.ts
- apps/api/src/notifications/channels/index.ts
- apps/api/src/config/env.ts, .env.example

interfaces:

- `sendWhatsAppNotification(config, message, pwaUrl, fetchImpl?)`
- `WhatsAppConfig` — baseUrl, token
- the keys `WHATSAPP_BRIDGE_URL`, `WHATSAPP_BRIDGE_TOKEN`

## Task

1. The adapter `apps/api/src/notifications/channels/whatsapp.ts` sends the
   message as `POST {baseUrl}/messages` with `{ chatId, text }` and the bearer
   of the bridge; `202` and `200` mean success, every other answer is a
   `WhatsAppError` with the code `http_error`.
2. The chain entry in `channels/index.ts` reads the configuration of the channel
   (the database first, the environment as the fallback) and is configured only
   when a bridge URL and a token are there; the chain of §11.1 places
   `whatsapp` behind `webpush`.
3. The environment keys `WHATSAPP_BRIDGE_URL` and `WHATSAPP_BRIDGE_TOKEN` are
   added to the schema of the environment and to `.env.example`.
4. A unit test with a mocked `fetch` proves the payload, the bearer and the
   error code; the token never appears in an error message.

## Non-goals

- No browser, no Chromium, no session file and no service in the Compose stack
  (ADR-0020).
- No account of a user and no pairing — that is WP-M14-15.
- No change of the other adapters.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the adapter sends the documented contract, the channel is
configured only with a bridge and the docker compose stack is unchanged.

## Handoff

- Files changed: the new adapter, the registry, the environment schema, the
  example environment and the tests
- Interfaces added: `sendWhatsAppNotification`, `WhatsAppConfig`
- Verified: `npm run check`
- Follow-up WP: WP-M14-15 — the chats of the bridge and the account of a user
- Open question: none
