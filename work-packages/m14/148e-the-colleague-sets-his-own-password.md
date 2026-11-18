# WP-M14-148e: the colleague sets his own password

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/01-rbac.md §3.9
spec-lines: 20

depends-on: WP-M14-148d

files-read:

- apps/web/src/auth/require-session.tsx (the gate of the app)
- apps/web/src/auth/login-form.tsx (the form of the login)
- apps/web/src/i18n/locales/de/common.json (the texts of the login)

files-write:

- apps/web/src/auth/password-change-form.tsx
- apps/web/src/auth/require-session.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- the form of the own password — `PasswordChangeForm`, the answer of
  `PATCH /api/v1/users/me` with the `password`
- the texts `auth.passwordChange.*` (de/en) — the title, the two fields, the
  hint and the errors of the form

## Task

1. The new module `apps/web/src/auth/password-change-form.tsx` renders the form
   of the own password: two fields (the new password and its repetition), a
   minimum length of 12 characters, a button and the error of the server. The
   form sends `PATCH /api/v1/users/me` with the `password` — the route of
   WP-M14-148c clears the flag and deletes the sessions of the other devices.
   The repetition must match the first field before the request leaves the
   browser; the server knows only the one password.
2. `apps/web/src/auth/require-session.tsx`: while the flag of the user is set,
   the gate renders the form instead of the page of the app. The flag comes
   from the answer of the login and from `GET /api/v1/me`, so the form appears
   right after the login and after a reload of the page.
3. The texts `auth.passwordChange.*` in `common` (de and en): the title, the
   hint that the one-time password is replaced by a secret of the own account,
   the labels of the two fields, the mismatch of the repetition, the length
   hint, the button and the texts of the error codes `invalid_request`,
   `session_invalid` and `unknown`.
4. The web test gains the cases: the form appears while the flag is set, the
   page of the app does not, the repetition must match, the request carries the
   password and the flag of the answer unlocks the app.

## Non-goals

- No page of the administration (WP-M14-148f).
- No confirmation of the old password: the login with the one-time password was
  the proof (ADR-0031).
- No password policy beyond the minimum length of 12 characters.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the new form, the gate of the app, the two locale files, the
  web test, this document, `work-packages/README.md`, `CHANGELOG.md`,
  `PLAN.md` §16, `docs/REPO-MAP.md`
- Interfaces added: `PasswordChangeForm`, the texts `auth.passwordChange.*`
- Verified: `npm run check`
- Follow-up WP: WP-M14-148f
- Open question: none
