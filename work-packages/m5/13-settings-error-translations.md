# WP-M5-13: translate the remaining admin error codes

format: small-model
status: done
depends-on: WP-M5-12
phase: 5
milestone: m5
context-budget: 12k tokens
spec: PLAN.md §3.1 (i18n mechanics, de/en parity)
spec-lines: 15

files-read:

- apps/api/src/auth/api-keys.ts — `api_key_not_found`, `api_key_create_failed`
- apps/api/src/webhooks/endpoints.ts — `webhook_create_failed`
- apps/web/src/admin/api-keys-page.tsx — `errorCode()` renders the code as key
- apps/web/src/admin/webhooks-page.tsx — `errorCode()` renders the code as key
- apps/web/src/i18n/locales/de/settings.json and `en/settings.json`

files-write:

- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- work-packages/m5/13-settings-error-translations.md (this file)

interfaces:

- `apiKeys.errors.*` and `webhooks.errors.*` cover every code those pages render
  raw, so a failed request never shows `apiKeys.errors.api_key_not_found`.

## Task

1. `settings.json` de/en: add `apiKeys.errors.api_key_not_found` and
   `apiKeys.errors.api_key_create_failed`.
2. `settings.json` de/en: add `webhooks.errors.webhook_create_failed`.
3. Keep de/en symmetric.

## Non-goals

- No API change.
- No change to the handled-code lists of the other admin pages; those fall back to
  `unknown` and were verified complete.
- No UI redesign.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; de/en stay symmetric.

## Handoff

- Files changed: `apps/web/src/i18n/locales/de/settings.json`, `apps/web/src/i18n/locales/en/settings.json`
- Interfaces added: none
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors, 7 pre-existing warnings), `npm run test:run` (469 passed, 445 integration tests skipped without a database), `npm run i18n:check` (1071/1071), `npm run wp:check`
- Follow-up WP: none
- Open question: none
