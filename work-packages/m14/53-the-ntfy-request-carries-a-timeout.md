# WP-M14-53: the ntfy request carries a timeout

format: small-model
status: done
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

- `NTFY_TIMEOUT_MS = 10_000`, `NtfyConfig.timeoutMs` (test seam, defaults to the
  constant)
- `NtfyError('http_timeout')` when the publish request does not answer in time
- `admin.channels.errors.http_timeout` (de/en)

## Task

`fetch` has no default timeout, so an ntfy server that accepts the connection
but never answers holds the drain worker and the admin test send open; the
administration shows no reason and the row is stuck.

1. `sendNtfyNotification` passes `AbortSignal.timeout(timeoutMs)` to the request,
   `timeoutMs` being `config.timeoutMs ?? NTFY_TIMEOUT_MS` (ten seconds).
2. An aborted request — the abort error or an answer that arrives after the
   deadline — ends as `NtfyError('http_timeout')`; every other error stays as it
   is, so the three attempts with backoff and the fallback chain of §11.7 still
   apply.
3. The adapter test asserts that a late answer yields `http_timeout`.
4. `admin.channels.errors.http_timeout` (de/en) names the deadline, the address
   and network check and the fact that the row stays retryable.

## Non-goals

- No new retry logic, no new outbox rule and no new state.
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

- Files changed: `apps/api/src/notifications/channels/ntfy.ts`, its test, the
  de/en `settings.json`.
- Interfaces added: `NTFY_TIMEOUT_MS`, `NtfyConfig.timeoutMs`, the machine code
  `http_timeout` and its translated reason.
- Verified: `npm run check` and `npm run build` green; without the change the
  late answer would have been accepted and no code existed for a timeout.
- Follow-up WP: none
- Open question: none
