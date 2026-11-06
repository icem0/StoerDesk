# WP-M2-94b: name fields in the users page UI

format: small-model
status: planned
depends-on: WP-M2-94 (name fields in shared schemas and admin user API)
phase: 2
context-budget: 14k tokens
spec: PLAN.md §7 (admin user API), PLAN.md §6 (`users` name columns), specs/01-rbac.md §4.1
spec-lines: 10

files-read:

- apps/web/src/admin/users-page.tsx — `CreateUserForm`, `EditUserForm`, table columns
- apps/web/src/i18n/locales/de/settings.json — `admin.users.fields` labels
- apps/web/src/i18n/locales/en/settings.json — `admin.users.fields` labels
- packages/shared/src/schemas/user.ts — `userNameSchema` reference

files-write:

- apps/web/src/admin/users-page.tsx — `givenName`/`familyName` inputs and name column
- apps/web/src/i18n/locales/de/settings.json — `givenName`, `familyName` labels
- apps/web/src/i18n/locales/en/settings.json — `givenName`, `familyName` labels

interfaces:

- `admin.users.fields.givenName` / `admin.users.fields.familyName` — i18n keys
- `CreateUserRequest.givenName` / `familyName` default `''`; `UpdateUserRequest` optional

## Task

1. `users-page.tsx`: add `givenName` and `familyName` input fields (trim, max 64, via `userNameSchema`) to `CreateUserForm` after the e-mail field and to `EditUserForm` after the password field, initialised from `user.givenName` / `user.familyName`.
2. `users-page.tsx`: add a table column "Name" showing `givenName familyName` between E-Mail and Sprache.
3. `de`/`en` `settings.json`: add `admin.users.fields.givenName` = "Vorname"/"First name" and `admin.users.fields.familyName` = "Nachname"/"Last name".

## Non-goals

- No schema, migration or API change — WP-M2-94 already carries them.
- No `/me` or session change.
- No name in the public report path or ticket history.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; i18n key parity de/en; every key referenced in `apps/web/src` exists.

## Handoff

- Files changed: `apps/web/src/admin/users-page.tsx`, `apps/web/src/i18n/locales/de/settings.json`, `apps/web/src/i18n/locales/en/settings.json`
- Interfaces added: `givenName`/`familyName` inputs on `/admin/users` create and edit forms; name column in the user table
- Follow-up WP: none
- Open question: none
