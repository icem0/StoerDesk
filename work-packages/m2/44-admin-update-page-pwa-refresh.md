# WP-M2-44: clean PWA update page in the administration (stage 1)

format: small-model
status: implemented
depends-on: WP-M2-43
phase: 2
context-budget: 20k tokens
spec: specs/18-self-update.md §18.2 (stage 1), PLAN.md §10 (PWA update)
spec-lines: 40

files-read:

- specs/18-self-update.md §18.2
- apps/web/src/sw.ts — injectManifest SW, no skipWaiting handler yet
- apps/web/src/main.tsx — how the service worker is registered
- apps/web/src/lib/outbox.ts — queuedReports() for the outbox guard
- apps/web/src/admin/bma-sync-page.tsx — the guarded admin page + back link pattern
- apps/web/src/admin/admin-home-page.tsx — the MODULES card list

files-write:

- apps/web/src/admin/update-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/sw.ts
  # fixtures (excluded from the source budget): apps/web/src/i18n/locales/de/settings.json,
  # apps/web/src/i18n/locales/en/settings.json, plus the page test

interfaces:

- `UpdatePage` at the guarded route `/admin/update` inside `RequireSession`
- SW message contract: `SKIP_WAITING` → `self.skipWaiting()`, `GET_VERSION` →
  reply `appVersion`, `CLEAR_CACHES` → delete every `caches` key and answer on
  the optional `MessagePort`
- clean-update handlers inside the page: registration `update()` → waiting worker
  → `SKIP_WAITING` → reload on `controllerchange`; a clear-caches action posts
  `CLEAR_CACHES`, unregisters and reloads; actions are disabled while the outbox
  is pending
- i18n keys `settings:admin.update.*` (title, hint, currentVersion, checkUpdate,
  updateAvailable, reload, clearCache, outboxBlocked, errors) and the module card
  keys `settings:admin.home.modules.update.{title,hint}` — de and en complete

## Task

1. `sw.ts`: add a `message` listener — `SKIP_WAITING` calls `self.skipWaiting()`,
   `CLEAR_CACHES` deletes every `caches` key. Keep precache and the report queue
   unchanged.
2. `update-page.tsx`: back link to `/admin`, heading, the current app version
   (`appVersion`) and the active SW version. "Update prüfen" calls
   `registration.update()`; when an updated/waiting worker appears show
   `updateAvailable` + "Jetzt neu laden" which posts `SKIP_WAITING` and reloads
   on `controllerchange`. "Cache leeren & neu laden" posts `CLEAR_CACHES`,
   unregisters and reloads.
3. Outbox guard: use `queuedReports()`; while any row is `queued`/`sending`
   disable both actions and show `outboxBlocked`. No literal strings.
4. Register `/admin/update` in `routes/index.tsx` and add the module card
   `{ key: 'update', to: '/admin/update' }` in `admin-home-page.tsx`.
5. Add the `settings:admin.update.*` and the `modules.update.*` keys in de and en.

## Non-goals

- No host access, no update run, no agent, no `UPDATE_AGENT_TOKEN` (ADR-0004).
- No update-availability network check (§18.3).
- No new permission key, no migration, no table.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; de and en carry the same new key set.

## Handoff

- Files changed: sw.ts, the new page, the route table, the admin-home card and the
  two locale fixtures, plus `apps/web/src/admin/__tests__/update-page.test.tsx`.
- Interfaces added: `UpdatePage`, the `SKIP_WAITING`/`CLEAR_CACHES` SW messages and
  the `settings:admin.update.*` keys.
- Verified: `typecheck`, `lint`, `test:run`, `i18n:check`, `wp:check` green —
  299 unit/integration tests, 527 de/en keys, 112 small-model WPs, 0 failures.
- Follow-up WP: none. Stage 2 (host agent, `update_runs`, `system.update`) is
  planned in `specs/18-self-update.md` §18.4 and gets its own WP when opened.
- Open question: none
