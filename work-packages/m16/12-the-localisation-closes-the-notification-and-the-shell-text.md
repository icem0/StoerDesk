# WP-M16-12: the localisation closes the notification and the shell text

format: small-model
status: done
depends-on: WP-M1-04, WP-M7-04b, WP-M14-161d, WP-M15-09
phase: 16
milestone: m16
context-budget: 18k tokens
spec: specs/10-notifications.md §11.1; PLAN.md §3.1
spec-lines: 40

files-read:

- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/verification.ts
- apps/web/src/admin/channels-page.tsx
- apps/api/src/stats/routes.ts
- apps/web/index.html
- packages/shared/src/i18n/server.de.json

files-write:

- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/verification.ts
- apps/api/src/stats/routes.ts
- apps/web/src/admin/channels-page.tsx

interfaces:

- `notification.test_title`, `notification.test_body` — new keys in `server.{de,en}.json`.
- `settings.channels.testTitle`, `settings.channels.testBody` — new keys in the web
  dictionaries.
- `sendTestMessage(channels, kind, testTopic?, locale?)` — the test-send answer builds
  its message from the shared `t()` with the session locale of the sender.
- `requestNtfyVerification(database, env, { fetchImpl?, locale? })` — the verification
  code reaches the ntfy inbox in the session locale of the sender.

## Task

1. Add `notification.test_title` and `notification.test_body` to `server.de.json`
   and `server.en.json` and lock them in `t.test.ts`.
2. `sendTestMessage` (apps/api/src/notifications/routes.ts:206) takes an optional
   `locale`; the module-level `TEST_MESSAGE` literal is dropped, the message is built
   from `t(lng, 'notification.test_title')` / `…test_body`. The two call sites
   (`/admin/channels/:kind/test`, `/notifications/accounts/ntfy/test`) pass
   `request.user?.locale`. `type NotificationMessage` drops from the imports.
3. `requestNtfyVerification` (verification.ts:110) accepts `locale` in its options;
   the pinned `t('de', 'notification.verification_code', …)` at L151 becomes
   `t(lng, …)` where `lng` defaults to `de`. The route in routes.ts:510 forwards
   `request.user?.locale`.
4. `settings.channels.testTitle` and `testBody` are added to the web dictionaries;
   `buildNtfyCurl(url, topic, secretSet, title, message)` (channels-page.tsx:52) takes
   the translated strings and the caller passes `t('channels.testTitle')` and
   `t('channels.testBody')` — the curl body in the clipboard is translated.
5. The CSV attachment name `stoerdesk-statistik-…csv` at apps/api/src/stats/routes.ts:255
   becomes `stoerdesk-statistics-…csv` (code-language rule §3 L70); the
   `<meta description>` in `apps/web/index.html:8` moves from German to English,
   matching the already-English vite manifest.
6. `docs/I18N.md:17` is refreshed to the current state of the web namespaces.

## Non-goals

- No change to the `de`-pinned outbox message (its comment at outbox.ts:258-265
  documents the reference locale on purpose).
- No change to the vite PWA manifest (`apps/web/vite.config.ts:42` stays English).
- No change to `<html lang="de">` in the boot HTML — the GUI language is set by
  i18next at runtime; the shell HTML carries no UI text of its own.
- No change to the empty `errors.json`, `validation.json` (web) and `seed.{de,en}.json`
  (shared) — they are registered placeholders, not defects.
- No localisation of the German demo objects — the DB column `objects.name`
  (schema.ts:309) is a single string without a locale map; a schema migration
  would be needed and belongs to a different WP.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green. `t.test.ts` and `verification.unit.spec.ts` and `channels-page.test.tsx`
carry new assertions for the de/en pair; the test-send answer never contains an
untranslated literal.

## Handoff

- Files changed: `packages/shared/src/i18n/server.{de,en}.json`,
  `apps/web/src/i18n/locales/{de,en}/settings.json`,
  `apps/api/src/notifications/routes.ts`,
  `apps/api/src/notifications/verification.ts`,
  `apps/web/src/admin/channels-page.tsx`,
  `apps/api/src/stats/routes.ts`, `apps/web/index.html`, `docs/I18N.md` and the
  tests `t.test.ts`, `verification.unit.spec.ts`, `channels-page.test.tsx`
- Interfaces added: `notification.test_title` / `notification.test_body` in the
  server dictionaries, `admin.channels.testTitle` / `testBody` in the web
  dictionaries, `sendTestMessage(…, locale)` and
  `requestNtfyVerification(…, locale)` take the session locale of the sender
- Verified: the record of this handoff is completed in the commit of
  WP-M16-10f — the implementation shipped in commit 1a4731f0 with the whole
  `npm run check` green including `i18n:check` and the new de/en assertions
- Follow-up WP: none — phase 16 is not yet closed by the 10f/10g/10h chain; this
  WP is out of band.
- Open question: none
