# WP-M3-10: the update menu in the shell header

format: small-model
status: implemented
depends-on: WP-M3-08
phase: 3
milestone: m3
context-budget: 24k tokens
spec: specs/18-self-update.md §18.2
spec-lines: 40

files-read:

- apps/web/src/components/app-version.tsx — the version badge of the header
- apps/web/src/components/Shell.tsx — the header and the settings menu
- apps/web/src/admin/update-page.tsx — the old update page
- apps/web/src/admin/update-host-update.tsx — the old host update section
- apps/web/src/i18n/locales/de/settings.json — the texts of the page
- apps/web/src/lib/api.ts — the API client of the web app

files-write:

- apps/web/src/admin/update-panel.tsx
- apps/web/src/components/app-version.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/settings.json

interfaces:

- `UpdatePanel` — the panel of the update menu
- `AppVersion` — the badge; a button for a user with `system.update`
- `GET /api/v1/admin/update/check`, `POST /api/v1/admin/update/start`

## Task

The update menu replaces the page `/admin/update`:

1. Add `apps/web/src/admin/update-panel.tsx`: the panel reads
   `GET /api/v1/admin/update/check` and shows the installed version, the
   installed commit, the newest upstream commit, whether an update is
   available, the number of commits behind and the commits themselves. A start
   sends `POST /api/v1/admin/update/start` after an explicit confirmation; the
   panel states that the stack restarts itself.
2. `apps/web/src/components/app-version.tsx`: the badge becomes a button that
   opens the panel for a user with the permission `system.update`; every other
   user keeps the plain text.
3. `apps/web/src/routes/index.tsx`: the route `/admin/update` and the old pages
   are gone; the administration home loses the module `update`.
4. The texts of the `settings` namespace are rewritten: `admin.update.*` in
   German and English, the old keys of the page and of the host update are
   removed.
5. The tests of the old page are replaced by a test of the panel and a test of
   the badge.

## Non-goals

- No change of the report form, the outbox or the service worker.
- No client-side GitHub call: the check runs in the API.
- No new permission key.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run test:run -w @stoerdesk/web
npm run check
```

Expected: all green; the panel test proves the hidden state without the
permission, the shown state with the permission, the confirmation and the
answer of the start.

## Handoff

- Files changed: `apps/web/src/admin/update-panel.tsx` (new),
  `apps/web/src/admin/__tests__/update-panel.test.tsx` (new),
  `apps/web/src/components/app-version.tsx`,
  `apps/web/src/components/__tests__/app-version.test.tsx`,
  `apps/web/src/routes/index.tsx`, `apps/web/src/admin/admin-home-page.tsx`,
  `apps/web/src/i18n/locales/de/settings.json`,
  `apps/web/src/i18n/locales/en/settings.json`, `apps/web/src/sw.ts`,
  `docs/REPO-MAP.md`, `CHANGELOG.md`; the old page
  `apps/web/src/admin/update-page.tsx`, the host update section
  `apps/web/src/admin/update-host-update.tsx` and their tests are deleted
- Interfaces added: `UpdatePanel`; the badge `AppVersion` becomes a button for
  a user with `system.update`
- Verified: `npm run check` (64 files, 410 tests, i18n and wp-check green); the
  panel test proves the answer, the confirmation, the start and the error codes,
  the badge test proves the hidden state without the permission
- Follow-up WP: WP-M3-12 (the documentation)
- Open question: none
