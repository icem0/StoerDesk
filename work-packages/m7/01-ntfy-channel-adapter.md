# WP-M7-01: ntfy channel adapter (server-side push)

format: small-model
status: planned
depends-on: WP-M1-12
phase: 7
context-budget: 22k tokens
spec: PLAN.md §16 (Phase 7 — Notifications), PLAN.md §4 (Push), specs/10-notifications.md
spec-lines: 40

files-read:

- PLAN.md (§4 Push, §16 Phase 7)
- apps/api/src/notifications/channels/index.ts
- apps/api/src/notifications/channels/signal.ts
- apps/api/src/notifications/channels/matrix.ts
- apps/api/src/config/env.ts

files-write:

- apps/api/src/notifications/channels/ntfy.ts
- apps/api/src/notifications/channels/index.ts
- apps/api/src/config/env.ts

interfaces:

- `sendNtfyNotification(config, message, pwaUrl, fetchImpl?): Promise<void>` — HTTP POST to `${NTFY_URL}/${NTFY_TOPIC}` with JSON body `{ title, message, actions: [{ action: 'view', label, uri: pwaUrl }] }`
- `NtfyError` with `{ code, params }` (`http_error`, `400`+`status`)
- `configuredChannels(env)` gains an ntfy entry when `NTFY_URL` and `NTFY_TOPIC` are set
- Env: new `PWA_URL` (public URL of the PWA, used as the ntfy action link)

## Task

1. `apps/api/src/config/env.ts`: add `PWA_URL: z.string().default('')` — the public URL of the StörDesk PWA, used as the `uri` in ntfy actions. Document it in `.env.example` under Notifications / ntfy.
2. `apps/api/src/notifications/channels/ntfy.ts`: `sendNtfyNotification` posts `{ title, message, actions: [{ action: 'view', label: 'Öffnen', uri: pwaUrl }] }` as JSON to `${config.url}/${config.topic}`; throws `NtfyError('http_error', ...)` on non-2xx; follows the same `fetchImpl` injection pattern as `signal.ts` and `matrix.ts`.
3. `apps/api/src/notifications/channels/index.ts`: register an ntfy channel in `configuredChannels(env)` when `env.NTFY_URL !== '' && env.NTFY_TOPIC !== ''`; its `send` calls `sendNtfyNotification` with `env.PWA_URL`.

## Non-goals

- No ntfy server container (PLAN.md §10: StörDesk never ships ntfy).
- No outbox worker, no retry/fallback logic (phase 7 outbox worker WP).
- No web UI, no QR code, no i18n (WP-M7-03).
- No ticket trigger — nothing sends ntfy messages yet.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. No database needed — `configuredChannels` is pure config logic.

## Handoff

- Files changed: the three files above plus `.env.example` (documented env var)
- Interfaces added: `sendNtfyNotification`, `NtfyError`, ntfy entry in `configuredChannels`, `PWA_URL` env var
- Deviation: `PWA_URL` defaults to `''`; when empty the ntfy action has no `uri` (notification still arrives, just not clickable)
- Follow-up WP: WP-M7-02 (unit test), WP-M7-03 (QR code + i18n)
- Open question: none — ntfy action label is hard-coded German ('Öffnen') until WP-M7-03 adds i18n
