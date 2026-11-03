# WP-M2-38: BMAcloud sync card on the administration home

format: small-model
status: planned
depends-on: WP-M2-37
phase: 2
context-budget: 12k tokens
spec: PLAN.md §14 (settings), specs/17-bmacloud-sync.md §17.5 (admin UI page)
spec-lines: 20

files-read:

- apps/web/src/admin/admin-home-page.tsx — the `MODULES` list and its available/planned
  badge logic (WP-M2-24)
- apps/web/src/i18n/locales/de/settings.json — the `admin.home.modules.*` block

files-write:

- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `MODULES` gains `{ key: 'bmaSync', to: '/admin/bma-sync' }` — an available module, so it
  renders the link card with the `admin.home.available` badge
- i18n keys `settings:admin.home.modules.bmaSync.title` and `.hint` (de and en)

## Task

1. Add the `bmaSync` entry to the `MODULES` list of `admin-home-page.tsx` after `roles`, so
   the administration home links the page of WP-M2-37.
2. Add the two German and two English module labels; the German pair names the source
   ("BMAcloud-Abgleich") and says that the object list is pulled read-only.
3. Nothing else changes: the existing badge logic already marks a module without `to` as
   planned, and the planned-phase lists stay untouched.

## Non-goals

- No settings menu entry (WP-M2-25 grouped the menu already; a new entry there needs its
  own WP if wanted).
- No permission filter on the card — the page itself guards with `object.read`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the existing `admin-home` test still passes and de/en stay parallel.

## Handoff

- Files changed: the three files above, `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: the `bmaSync` module card
- Verified: —
- Follow-up WP: none — WP-M2-39 is announced by WP-M2-37
- Open question: none
