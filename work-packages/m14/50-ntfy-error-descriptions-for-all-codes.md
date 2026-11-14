# WP-M14-50: ntfy error codes explain themselves

format: small-model
status: done
depends-on: WP-M14-49
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/10-notifications.md §11.11
spec-lines: 20

files-read:

- apps/web/src/admin/channels-page.tsx (test result)
- apps/web/src/i18n/locales/de/settings.json (admin.channels.errors)
- apps/web/src/i18n/locales/en/settings.json (admin.channels.errors)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/__tests__/channels-page.test.tsx
- apps/web/src/i18n/locales/{de,en}/settings.json
- work-packages/m14/50-ntfy-error-descriptions-for-all-codes.md

interfaces:

- `admin.channels.errors.http_error` plus `http_400 … http_504` (de/en) explain every ntfy HTTP status with a concrete hint
- Unknown codes fall back to `http_error` with the raw code
- Test shows the translated reason instead of the raw code

## Task

1. Every ntfy HTTP status from 400 to 504 gets a translated reason text with a concrete hint (topic taken, rate limit, server down …).
2. Unknown codes fall back to a generic text that still shows the code.
3. A regression test covers an unknown code.

## Non-goals

- No change of the ntfy adapter or the API contract.
- No new codes beyond 400–504 plus the generic fallback.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- The user now sees a lösungsorientierte Erklärung für jeden ntfy-Fehlercode statt eines rohen Codes.
