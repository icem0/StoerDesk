# WP-M14-176: the web push sends through the library of the built API

format: small-model
status: done
depends-on: WP-M14-171, WP-M14-175
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.15
spec-lines: 60

files-read:

- apps/api/src/notifications/channels/web-push.ts (the transport, the codes)
- apps/api/src/notifications/channels/__tests__/web-push.test.ts (the transport tests)
- node_modules/web-push/src/index.js and `web-push-lib.js` (the shape of the export)
- specs/10-notifications.md §11.15 (the codes of a failing web push)
- docs/DECISIONS/0010-web-push-over-the-web-push-library.md (ADR-0010)

files-write:

- apps/api/src/notifications/channels/web-push.ts and its test
  apps/api/src/notifications/channels/__tests__/web-push.test.ts (the transport
  and the codes) plus the new
  apps/api/src/notifications/channels/__tests__/web-push-esm.spec.ts (the
  runtime of the production)
- apps/web/src/i18n/locales/de/settings.json and en/settings.json (the text of
  `push_send_failed`)
- specs/10-notifications.md §11.15 (the code in the contract)
- docs/VAPID-SETUP.md, docs/REPO-MAP.md, docs/SECURITY-PLAN.md, CHANGELOG.md,
  work-packages/README.md, PLAN.md §16, this document

interfaces:

- `sendWebPushNotification(config, message, pwaUrl, subscriptions, sendImpl?)` —
  the default of `sendImpl` is the sender of the library, resolved through the
  **default** import of `web-push`
- `WebPushError.code` gains `push_send_failed` (the failure before the request);
  `push_unreachable` keeps every transport failure with an errno

## Task

**The fault of the office (out of band in phase 14).** The delivery problems
named `push_unreachable` for every push: „Der Push-Dienst hat nicht geantwortet:
die Verbindung ist fehlgeschlagen (Netzwerk, DNS oder TLS)". No push ever
reached a device.

1. `web-push` is a CommonJS package. Its `module.exports` carries
   `sendNotification` as a **call expression**
   (`webPush.sendNotification.bind(webPush)`), and Node's ESM loader exposes a
   named export of a CommonJS module only when its lexer can read the property
   statically. The built API runs as an ES module (`esbuild --format=esm`,
   Node ESM), so the namespace import left `sendNotification` **undefined**
   there: every send died with a `TypeError` before the request, and the
   failure was reported as an unreachable push service. The adapter imports the
   library through its **default** export now, and a guard names a build
   without a transport `push_send_failed` instead of a misdiagnosis.
2. A failure **before** the request leaves the server — a broken subscription
   row, a missing transport — carries the new code `push_send_failed`; the
   network codes keep their meaning. The errno of a transport failure reaches
   the log even when its name is long (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), and
   the timeout of the library is `push_timeout`.
3. The request carries a socket timeout of 10 s, so a push service that accepts
   the connection but never answers cannot block the drain of the outbox.
4. `web-push-esm.spec.ts` runs the adapter in a **child process under Node** —
   the loader of the production — and proves that a request leaves it. Vitest
   cannot see the defect: its module runner resolves the CommonJS package
   differently and hands the named export out.

## Non-goals

- No change of the outbox, of the chain of §11.1 or of the retry.
- No new ADR: ADR-0010 keeps the library, only the import of it changes.
- No configurable timeout: the value is a constant of the adapter.
- No change of the browser side of the push.

## Acceptance

```bash
npx vitest run apps/api/src/notifications/channels/__tests__/web-push.test.ts apps/api/src/notifications/channels/__tests__/web-push-esm.spec.ts
npm run check
```

Expected: the transport tests name `push_send_failed` for a failure before the
request and `push_timeout` for the timeout of the library; the test of the
runtime fails before the change (the code was `push_send_failed` instead of
`push_unreachable`) and passes after it; the full gate is green.

## Handoff

- Files changed: `web-push.ts`, `web-push.test.ts`, `web-push-esm.spec.ts`,
  `settings.json` (de, en), `specs/10-notifications.md`, `docs/VAPID-SETUP.md`,
  `docs/REPO-MAP.md`, `docs/SECURITY-PLAN.md`, `CHANGELOG.md`,
  `work-packages/README.md`, `PLAN.md` §16
- Interfaces added: `WebPushError` code `push_send_failed`; the reason key
  `admin.delivery.reasons.push_send_failed`
- Verified: `npm run typecheck`, `eslint` (0 errors), `vitest run` (244 files,
  1690 tests), `i18n:check`, `wp:check`, `npm run test:e2e` (13 tests),
  `npm run build`; the security pass `web-push-transport` (A and B in full, C–K
  for the changed files) is recorded in `docs/SECURITY-PLAN.md`
- Follow-up WP: none
- Open question: none
