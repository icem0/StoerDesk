# WP-M2-26: back links in the admin pages

format: small-model
status: implemented
depends-on: WP-M2-25
phase: 2
context-budget: 14k tokens
spec: PLAN.md §14 (administration area), specs/13-ui.md (navigation)
spec-lines: 30

files-read:

- apps/web/src/admin/admin-home-page.tsx — the target of the back link (WP-M2-24)
- apps/web/src/admin/users-page.tsx — admin page without a back link
- apps/web/src/admin/roles-page.tsx — admin page without a back link
- apps/web/src/i18n/locales/de/settings.json — the `settings` namespace

files-write:

- apps/web/src/admin/users-page.tsx
- apps/web/src/admin/roles-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `UsersPage` and `RolesPage` render a `Link` to `/admin` above their heading with
  the label `settings:admin.back` (de `Zurück zur Verwaltung`).
- New i18n key `settings:admin.back` (de reference, en complete).

## Task

1. `users-page.tsx`: add a `Link to="/admin"` with the label `t('admin.back')`
   directly above the page heading, styled as a quiet text link (same typography
   as the existing hints, `focus-visible:ring-2`).
2. `roles-page.tsx`: the same link above the heading.
3. `settings.json` (`de` and `en`): add the single key `admin.back`.

## Non-goals

- No breadcrumb component and no browser `history.back()` button.
- No back link on the public report and status pages — they have no session and
  no administration parent.
- No change to the tables, forms or dialogs of the two pages.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the Playwright auth spec still finds the users table.

## Handoff

- Files changed: the four files above
- Interfaces added: back link on `/admin/users` and `/admin/roles`,
  `settings:admin.back` key
- Verified: `npm run check` green
- Follow-up WP: WP-M2-27 (`27-internal-ticket-error-hints.md`) — the earlier line of this
  handoff named `27-bmacloud-sync-decision.md`, a file that was never created; the BMAcloud
  decision had already landed in commit `a6804ed` and is recorded by **WP-M2-32**, whose
  chain WP-M2-33 … WP-M2-39 carries the implementation (`AGENTS.md`: a `Follow-up WP:` line
  without a WP file is a defect)
- Open question: none
