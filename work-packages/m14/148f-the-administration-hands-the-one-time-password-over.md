# WP-M14-148f: the administration hands the one-time password over

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/01-rbac.md §3.9
spec-lines: 20

depends-on: WP-M14-148e

files-read:

- apps/web/src/admin/users-page.tsx (the user management)
- apps/web/src/admin/api-keys-page.tsx (the secret-once panel with the copy)
- apps/web/src/i18n/locales/de/settings.json (the texts of the user management)

files-write:

- apps/web/src/admin/users-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- the action of the row — `POST /api/v1/users/:id/password` behind
  `user.write`
- the panel of the one-time password — the plaintext of the answer, a button
  that copies it into the clipboard and the button that closes the panel
- the texts `admin.users.resetPassword.*` (de/en) — the action, the title of
  the panel, the hint and the texts of the errors

## Task

1. `apps/web/src/admin/users-page.tsx`: every row of the user list carries the
   action „Neues Passwort" next to „Bearbeiten" — only with `user.write`. The
   action asks for a confirmation (a password is replaced, the sessions of the
   account die with it) and sends `POST /api/v1/users/:id/password`.
2. The same file: the answer opens the panel of the one-time password — the
   plaintext in a field, a button that copies it into the clipboard (the button
   confirms the copy) and a button that closes the panel. The plaintext is
   shown once, because the server answers it once; the panel warns that it is
   a one-time password and that the colleague replaces it at the first login.
3. The same file: the list shows the flag per row — a badge names the
   colleagues who still hold a one-time password. The list is read again after
   the reset, so the badge appears without a reload of the page.
4. The texts `admin.users.resetPassword.*` in `settings` (de and en): the
   action, the confirmation, the title of the panel, the hint, the copied
   button and the texts of the error codes `forbidden`, `invalid_request`,
   `session_invalid` and `unknown`.
5. The web test gains the cases: the action asks before it sends, the panel
   shows the plaintext, the copy button writes it into the clipboard, the
   badge names the row and the answer of an error names its code.

## Non-goals

- No mail, no link, no list of the one-time passwords (ADR-0031).
- No change of the create form and of the edit form: the password field of the
  edit form stays, it sets a password of the administration's choice.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the user management, the two locale files, the web test, this
  document, `work-packages/README.md`, `CHANGELOG.md`, `PLAN.md` §16
- Interfaces added: the action of the row, the panel of the one-time password,
  the texts `admin.users.resetPassword.*`
- Verified: `npm run check`
- Follow-up WP: none — the chain of the one-time password is closed
- Open question: none
