# WP-M14-01: The administration home disappears — its links live in the settings menu

format: small-model
status: done
depends-on: —
phase: 14
milestone: m14
context-budget: 20k tokens
spec: PLAN.md §14, §16, §17; work-packages/m12/07-settings-overview-page.md
spec-lines: 40

files-read:

- PLAN.md (§14 internal surfaces, §16 roadmap, §17 work-package limits)
- apps/web/src/routes/index.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/i18n/locales/de/common.json
- work-packages/m12/07-settings-overview-page.md

files-write:

- apps/web/src/routes/index.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/admin/admin-home-page.tsx (removed)
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json, apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET /admin` → client-side redirect to `/settings` (no page of its own)
- `GET /admin/update` → client-side redirect to `/settings`
- `SettingsPage` — the administration group lists every module directly

## Task

1. The administration home at `/admin` is gone: `apps/web/src/admin/admin-home-page.tsx`
   and its test are deleted, the route answers with a redirect to `/settings` and
   the retired update address `/admin/update` lands on the settings menu.
2. The settings menu lists every administration module itself: the entry
   "Verwaltung öffnen" (`common:auth.links.admin`) is removed from
   `apps/web/src/settings/settings-page.tsx`, the modules of the administration
   group stay.
3. The texts of the removed page are deleted: the block `settings:admin.home.*`
   (title, hint, badges, phase labels and the module cards) leaves `de` and `en`,
   the label `common:auth.links.admin` leaves `de` and `en`.
4. The tests follow: the route test expects the settings menu behind
   `/admin/update` and behind `/admin`, the settings-page test proves that no
   link of the settings menu points to `/admin`.

## Non-goals

- No change to the modules of the administration, to their routes or to their
  permissions.
- No new settings, no new group in the settings menu, no change of the gear in
  the shell header.
- No back-link of the administration pages — that is WP-M14-02.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the route test and the settings-page test pass, the
`admin.home` texts and the label `auth.links.admin` are gone from `de` and `en`
and no key of a deleted text is referenced any more.

## Handoff

- Files changed: the route table, the settings page, the deleted administration
  home with its test, the locale files of `common` and `settings`, the route test,
  the settings-page test
- Interfaces added: the redirect `/admin` → `/settings`
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-02 — the back links of the administration pages
- Open question: none
