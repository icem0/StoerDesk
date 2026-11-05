# WP-M2-92d: theme select in the user settings

format: small-model
status: planned
depends-on: WP-M2-92b (PATCH accepts `theme`), WP-M2-92c (theme classes)
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

- `EditUserForm` renders a `select` `name="theme"` initialized from the user summary
  with options `auto`/`light`/`dark` labeled by `admin.users.themeValues.*`
- the PATCH body carries `theme`

## Task

1. `users-page.tsx`: `theme` value state (from `user.theme`), a `select` with the
   three options, PATCH body `theme: values.theme`.
2. `admin.json` de/en: `admin.users.fields.theme` (de "Design", en "Appearance") and
   `admin.users.themeValues.{auto,light,dark}` (de "Automatik (System)", "Light",
   "Dark"; en "Auto (system)", "Light", "Dark").
3. `users-page.test.tsx`: the select renders; changing it reaches the PATCH body.

## Non-goals

- No new users-list column, no self-service route (the admin edits users).
- No DB or schema change (WP-M2-92/92b).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- (filled by the implementing commit)
