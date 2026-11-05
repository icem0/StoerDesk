# WP-M2-92e: theme select in the user settings

format: small-model
status: implemented
depends-on: WP-M2-92c (admin API carries the theme)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §14 (theme per user), PLAN.md §7 (admin users API)
spec-lines: 10

files-read:

- apps/web/src/admin/users-page.tsx — `EditUserForm` and the PATCH body (WP-M1-09)
- apps/web/src/admin/__tests__/users-page.test.tsx — edit form tests
- apps/web/src/i18n/locales/de/admin.json — `admin.users.*` keys

files-write:

- apps/web/src/admin/users-page.tsx — theme select in `EditUserForm`, PATCH sends `theme`
- apps/web/src/i18n/locales/de/admin.json — theme labels (de reference)
- apps/web/src/i18n/locales/en/admin.json — same keys, English labels

interfaces:

- `EditUserForm` and `CreateUserForm` render a `select` `name="theme"` initialized
  from the user summary (the create form with `auto`), with the options
  `auto`/`light`/`dark`, labeled by `admin.users.themeValues.*`
- the PATCH body carries `theme`, the POST body of the create form as well

## Task

1. `users-page.tsx`: `theme` value state (from `user.theme`), a `select` with the
   three options, PATCH body `theme: values.theme`.
2. `admin.json` de/en: `admin.users.fields.theme` (de "Design", en "Appearance") and
   `admin.users.themeValues.{auto,light,dark}` (de "Automatik (System)", "Light",
   "Dark"; en "Auto (system)", "Light", "Dark").
3. `users-page.test.tsx`: the select renders; a changed value reaches the PATCH body.

## Non-goals

- No new users-list column, no self-service route (the admin edits users).
- No DB or schema change (WP-M2-92/92b/92c).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/admin/users-page.tsx`,
  `apps/web/src/i18n/locales/de/settings.json`,
  `apps/web/src/i18n/locales/en/settings.json`,
  `apps/web/src/admin/__tests__/users-page.test.tsx` (test)
- Interfaces added: the theme select in the user management (create and edit form),
  the PATCH/POST bodies carry the theme; i18n keys `admin.users.fields.theme` and
  `admin.users.themeValues.{auto,light,dark}` in de and en
- Verified: `npm run check` green — the test proves the select of the edit form and
  the theme in the PATCH body
- Follow-up WP: none
- Open question: none
