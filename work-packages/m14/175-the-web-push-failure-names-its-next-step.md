# WP-M14-175: the web push failure names its cause and the next step

format: small-model
status: done
depends-on: WP-M14-171, WP-M14-173
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.15
spec-lines: 12

files-read:

- apps/api/src/notifications/channels/web-push.ts (the codes of a failed send, `codeOf`, `errnoOf`)
- apps/api/src/notifications/channels/__tests__/web-push.test.ts (the transport tests)
- apps/web/src/i18n/locales/de/settings.json (the reasons of the delivery page, `admin.delivery.reasons`)
- apps/web/src/i18n/locales/en/settings.json (the same keys in English)

files-write:

- apps/api/src/notifications/channels/web-push.ts and its test
  apps/api/src/notifications/channels/__tests__/web-push.test.ts (the transport
  codes)
- apps/web/src/i18n/locales/de/settings.json and en/settings.json (the texts
  with cause and next step) and apps/web/src/admin/__tests__/channels-page.test.tsx
  (the expected text of `push_unreachable`)
- docs/VAPID-SETUP.md, docs/REPO-MAP.md, CHANGELOG.md, work-packages/README.md,
  this document

interfaces:

- `WebPushError.code` gains `push_dns_failed` (errno `ENOTFOUND` or `EAI_AGAIN`)
  and `push_timeout` (errno `ETIMEDOUT` or `ESOCKETTIMEDOUT`); every other
  transport failure keeps `push_unreachable`
- `admin.delivery.reasons.<code>` gains `push_dns_failed` and `push_timeout`;
  the texts of the seven codes name the cause and the next step

## Task

**The fault of the office (out of band in phase 14).** The page of the delivery
problems showed „Der Push-Dienst hat nicht geantwortet: die Verbindung ist
fehlgeschlagen (Netzwerk, DNS oder TLS)“ for every transport failure. The
operator could not tell a DNS failure from a blocked port, and no text named the
step that solves the problem.

1. `codeOf` in `web-push.ts` receives the errno of a transport failure and maps
   it: `ENOTFOUND`, `EAI_AGAIN` → `push_dns_failed`; `ETIMEDOUT`,
   `ESOCKETTIMEDOUT` → `push_timeout`; any other errno or none →
   `push_unreachable`. Status codes keep their mapping (`push_unauthorized`,
   `push_rejected`).
2. The texts of `admin.delivery.reasons` (de, en) name the cause and the step:
   - `push_dns_failed`: the container cannot resolve the host of the push
     service; next step: DNS of the container or of the Docker daemon.
   - `push_timeout`: the push service does not answer in time; next step: allow
     outgoing port 443 to the host of the subscription in the firewall.
   - `push_unreachable`: connection refused, reset or TLS failure; next step:
     check the network path and the TLS setup from the API container.
   - `push_unauthorized`, `push_rejected`, `push_subscription_dead`,
     `vapid_key_mismatch`, `no_keys`: each text names the cause and the step.
3. The test file asserts the three codes for `ENOTFOUND`, `ETIMEDOUT` and
   `socket hang up`.
4. `docs/VAPID-SETUP.md` gets the same three codes in its diagnosis table.

## Non-goals

- No change of the delivery page (`delivery-page.tsx`): it already shows
  `reasons.<code>` and the code.
- No change of the outbox or the database: the outbox stores the code as it is.
- No retry of the 21 old failures: they stay in the list until acknowledged.
- No new ADR: the rules are in `specs/10-notifications.md` §11.15.

## Acceptance

```bash
npx vitest run apps/api/src/notifications/channels/__tests__/web-push.test.ts
npm run check
```

Expected: the web push tests name `push_dns_failed` for `ENOTFOUND` and
`push_timeout` for `ETIMEDOUT`; every text of the seven codes names the cause and
the next step in de and en; the full gate is green.

## Handoff

- Files changed: `web-push.ts`, `web-push.test.ts`, `channels-page.test.tsx`,
  `settings.json` (de, en), `docs/VAPID-SETUP.md`, `docs/REPO-MAP.md`,
  `CHANGELOG.md`, `work-packages/README.md`
- Interfaces added: `WebPushError` codes `push_dns_failed`, `push_timeout`;
  reason keys `admin.delivery.reasons.push_dns_failed`, `push_timeout`
- Verified: `npm run typecheck`, `eslint` (0 errors), `vitest run` (239 files,
  1664 tests), `i18n:check`, `wp:check`. Not green: `test:e2e` — two cases of
  `apps/web/e2e/workflow.spec.ts` (ticket history, DE and EN) also fail on the
  unchanged base commit, so they are not caused by this WP.
- Follow-up WP: none
- Open question: none
