# WP-M14-33: The ntfy deep link of the QR carries the host

format: small-model
status: done
depends-on: WP-M14-13
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.3; PLAN.md §12
spec-lines: 40

files-read:

- specs/10-notifications.md §11.3
- apps/api/src/notifications/routes.ts (the subscription answer of WP-M14-13)
- apps/web/src/features/settings/NtfySubscription.tsx (the QR card of WP-M7-03)

files-write:

- apps/api/src/notifications/routes.ts
- apps/web/src/features/settings/NtfySubscription.tsx

interfaces:

- `subscriptionValue(publicUrl, topic, deepLink)` — the deep link becomes
  `ntfy://<host>/<topic>` (with `?secure=false` for an `http://` server)
- the `deepLink` of `GET /api/v1/notifications/accounts/ntfy` carries the host too

## Task

The QR of WP-M7-03 and WP-M14-13 renders the deep link `ntfy://<topic>`, but the
ntfy app documents `ntfy://<host>/<topic>` as the link format that opens the
app and subscribes to the topic — a link without the host does not land on the
phone (the docs state that a `https://<host>/<topic>/subscribe` is not
possible on Android and the `ntfy://` link has to be used). Out of band in
phase 14, requested by the office:

1. In `NtfySubscription.tsx` the deep-link branch of `subscriptionValue`
   becomes `ntfy://<host>/<topic>` — host = `publicUrl` without its scheme
   (a bare host stays as it is) — and an `http://` server address appends the
   documented `?secure=false`; the web-address branch stays untouched.
2. In `routes.ts` the `deepLink` of `ntfySubscriptionOf` (WP-M14-13) carries
   the same host-carrying form.
3. Unit tests: `subscriptionValue` with `https://ntfy.sh`, a bare host and an
   `http://` server (`?secure=false`), and the WP-M14-13 route test asserts the
   host-carrying `deepLink`.

## Non-goals

- No credentials, token or user id in the QR or the deep link — ntfy offers no
  URL-login scheme and ADR-0005 keeps every secret write-only; a protected
  topic is unlocked by a login in the ntfy app itself, never by a scanned QR.
- No change of the adapter, the payload, the outbox or the escalation chain.
- No new i18n key, no migration, no `NTFY_AUTH_*` environment key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the deep link of card and route answer is
`ntfy://<host>/<topic>` (`?secure=false` for `http`), the QR stays
credential-free.

## Handoff

- Files changed: routes.ts, NtfySubscription.tsx and the two touched test
  files
- Interfaces added: the host-carrying deep link of the subscription answer
- Verified: `npm run wp:check`, `npm run i18n:check`, the two unit-test files
  green; a concurrent WP-M14-17 edit occupies notifications-page.tsx and its
  test — the doc-comment and mock deep-link updates there stayed out of this
  commit
- Follow-up WP: none
- Open question: none
