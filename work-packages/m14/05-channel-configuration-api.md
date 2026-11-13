# WP-M14-05: The API of the channel configuration

format: small-model
status: done
depends-on: WP-M14-04
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.2, §11.11; PLAN.md §12
spec-lines: 60

files-read:

- specs/10-notifications.md §11.2, §11.11
- apps/api/src/notifications/config.ts (the service of WP-M14-04)
- apps/api/src/notifications/channels/index.ts (the adapters)
- apps/api/src/webhooks/endpoints.ts (the shape of an admin route)
- apps/api/src/index.ts (the wiring of the plugins)

files-write:

- packages/shared/src/schemas/notification.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/index.ts

interfaces:

- `GET /api/v1/admin/channels` — the channels with their state (notification.read)
- `PATCH /api/v1/admin/channels/:kind` — the configuration (notification.write)
- `POST /api/v1/admin/channels/:kind/test` — a test message (notification.write)

## Task

1. The shared contracts of `packages/shared/src/schemas/notification.ts`: the
   channel list, the configuration of a channel (the secret is optional and
   write-only) and the answer of the test send.
2. `apps/api/src/notifications/routes.ts` answers the three routes of §11.11
   with the guards `notification.read` and `notification.write`; a secret in a
   `PATCH` replaces the stored secret, an empty value leaves it untouched and
   the answers never carry it.
3. The test send builds the message of the kind, calls the adapter of the
   registry and answers `{ delivered: boolean }`; a failure of the adapter is a
   `200` with `delivered: false` and the code of the failure — it is no HTTP
   error of the administration.
4. The plugin is registered in `apps/api/src/index.ts` behind
   `/api/v1/admin/channels`.

## Non-goals

- No page — the administration page is WP-M14-06.
- No account, no selection of the channels, no warning.
- No change of the adapters.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the routes answer with the guards of the permissions, a
stored secret never leaves the API and the test send reports the result of the
adapter.

## Handoff

- Files changed: the shared contracts, the new route module, the wiring in
  `index.ts` and the tests
- Interfaces added: the three routes of the channel configuration
- Verified: `npm run check`
- Follow-up WP: WP-M14-06 — the administration page of the channels
- Open question: none
