# WP-M7-02: Unit test for the ntfy channel adapter

format: small-model
status: planned
depends-on: WP-M7-01
phase: 7
context-budget: 18k tokens
spec: PLAN.md §16 (Phase 7 — Notifications), PLAN.md §4 (Push)
spec-lines: 10

files-read:

- apps/api/src/notifications/channels/ntfy.ts
- apps/api/src/notifications/channels/**tests**/signal.test.ts

files-write:

- apps/api/src/notifications/channels/**tests**/ntfy.test.ts

interfaces:

- `sendNtfyNotification(config, message, pwaUrl, fetchImpl?)` — tested with mocked `fetch`

## Task

1. `apps/api/src/notifications/channels/__tests__/ntfy.test.ts`: vitest suite mirroring `signal.test.ts` style.
   - posts JSON to `${NTFY_URL}/${NTFY_TOPIC}` with `title`, `message`, `actions`
   - `actions` contains `{ action: 'view', label: 'Öffnen', uri: pwaUrl }`
   - throws on non-2xx HTTP status
   - does not call `fetch` when `pwaUrl` handling is irrelevant (channel still sends)
   - verifies `content-type: application/json` header

## Non-goals

- No integration test against a real ntfy server (external service).
- No `configuredChannels` test (pure config, covered by WP-M7-01 typecheck).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new spec passes against the adapter from WP-M7-01.

## Handoff

- Files changed: the test file above
- Interfaces added: none (test only)
- Verified: `npm run test:run` — ntfy suite passes, signal/matrix suites still pass
- Follow-up WP: WP-M7-03 (QR code + i18n)
- Open question: none
