# WP-M14-53: the ntfy request carries a timeout

format: small-model
status: planned
depends-on: WP-M14-51
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/10-notifications.md §11.2, §11.7, §11.8
spec-lines: 20

files-read:

- apps/api/src/notifications/channels/ntfy.ts (the publish request)
- apps/api/src/notifications/channels/__tests__/ntfy.test.ts (the adapter test)
- apps/web/src/i18n/locales/de/settings.json (admin.channels.errors)
- apps/web/src/i18n/locales/en/settings.json (admin.channels.errors)

files-write:

- apps/api/src/notifications/channels/ntfy.ts
- apps/api/src/notifications/channels/__tests__/ntfy.test.ts
- apps/web/src/i18n/locales/{de,en}/settings.json
- work-packages/m14/53-the-ntfy-request-carries-a-timeout.md

interfaces:

- `NtfyError('http_timeout')` when the publish request does not answer in time
- `admin.channels.errors.http_timeout` (de/en)

## Task

`fetch` has no default timeout, so an ntfy server that accepts the connection
but never answers holds the drain worker and the admin test send open until the
process is stopped; the administration shows no reason at all.

1. `sendNtfyNotification` aborts the request with `AbortSignal.timeout` (a
   constant `NTFY_TIMEOUT_MS` of ten seconds) and maps the abort to
   `NtfyError('http_timeout')`.
2. The test asserts that an aborted request yields `http_timeout` and that a
   late answer never reaches the payload log again.
3. `admin.channels.errors.http_timeout` (de/en) says: the server did not answer
   in time — address and network check, the row stays retryable.
4. The outbox rules of §11.7 stay untouched: the row keeps its three attempts
   with backoff and the fallback chain.

## Non-goals

- No new retry logic and no new outbox rule.
- No timeout for the other adapters (they belong to their own WPs).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: —
- Interfaces added: —
- Verified: —
- Follow-up WP: none
- Open question: none
