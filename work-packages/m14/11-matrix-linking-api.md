# WP-M14-11: The Matrix account linking

format: small-model
status: done
depends-on: WP-M14-08
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.3, §11.11; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.3, §11.11
- apps/api/src/notifications/accounts.ts (the service of WP-M14-08)
- apps/api/src/notifications/channels/matrix.ts (the adapter)
- apps/api/src/notifications/routes.ts (the routes of WP-M14-05, WP-M14-09)

files-write:

- apps/api/src/notifications/matrix-linking.ts
- apps/api/src/notifications/routes.ts
- packages/shared/src/schemas/notification.ts

interfaces:

- `POST /api/v1/notifications/accounts/matrix` — the account of the user
- `DELETE /api/v1/notifications/accounts/:channel` — the own account is removed
- `verifyMatrixAccount(config): Promise<{ matrixId }>`

## Task

1. `apps/api/src/notifications/matrix-linking.ts` verifies an account with
   `GET /_matrix/client/v3/account/whoami` of the homeserver of the user: the
   answer must name the matrix id of the user, otherwise the account is
   refused with `422 invalid_request`.
2. The route `POST /api/v1/notifications/accounts/matrix` takes the homeserver,
   the matrix id and the access token, verifies the pair and stores the account;
   the token is stored write-only and is never answered.
3. `DELETE /api/v1/notifications/accounts/:channel` removes the own account of a
   channel and answers `204`; an unknown account answers `404`.
4. A unit test with a mocked homeserver proves the verification, the refused
   answer and that the token never appears in a log or an answer.

## Non-goals

- No page — the Matrix section of the settings page is WP-M14-12.
- No login of the user through Matrix (SSO), no reading of rooms.
- No change of the adapter of the channel.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a valid token is stored, a wrong pair is refused and the
token never leaves the API.

## Handoff

- Files changed: the new linking module, the routes, the shared contracts and
  the tests
- Interfaces added: the two routes of the Matrix linking
- Verified: `npm run check`
- Follow-up WP: WP-M14-12 — the Matrix section of the settings page
- Open question: none
