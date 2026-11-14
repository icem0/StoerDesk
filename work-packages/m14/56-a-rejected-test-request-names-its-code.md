# WP-M14-56: A rejected test request names its status and code

format: small-model
status: done
depends-on: WP-M14-55
phase: 14
milestone: m14
context-budget: 8k tokens
spec: specs/10-notifications.md §11.11, §11.14
spec-lines: 10

files-read:

- apps/web/src/admin/channels-page.tsx (the test error line)
- apps/web/src/lib/api.ts (`ApiError` carries status and code)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the fetch mock)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/__tests__/channels-page.test.tsx
- apps/web/src/i18n/locales/{de,en}/settings.json
- work-packages/m14/56-a-rejected-test-request-names-its-code.md

interfaces:

- `admin.channels.errors.request_failed` (de/en) with `{{status}}` and `{{code}}`
- `errorText(error)` in `ChannelCard`

## Task

A rejected test request showed the raw key `admin.channels.errors.FST_ERR_CTP_EMPTY_JSON_BODY`,
because the code is not a known machine code and i18next returns the key.

1. `errorText` maps an unknown code to `request_failed` with status and code; a
   request without a code is named as a network failure.
2. The test error line uses `errorText`.
3. The page test answers a `400` with a Fastify code and asserts the readable text.

## Non-goals

- No change of the API, the routes or the token wiring (verified by
  `routes.unit.spec.ts`, "sends the test message with the access token of the stored row").

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: the page, its test, `de`/`en` `settings.json`, this document.
- Interfaces added: `request_failed`, `errorText`.
- Verified: channels page tests 12/12, API token test green, `i18n:check` green.
- Follow-up WP: none.
- Open question: none.
