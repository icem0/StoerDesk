# WP-M14-164: the new API key gets its own page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.5; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-163

files-read:

- apps/web/src/admin/api-keys-page.tsx (the list and the inline create form)
- apps/web/src/admin/__tests__/api-keys-page.test.tsx (the tests of the list)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the API keys)
- specs/08-objects-api.md (§9.5 the API keys)
- docs/REPO-MAP.md (the module of the API keys page)

files-write:

- apps/web/src/admin/api-key-create-page.tsx
- apps/web/src/admin/api-keys-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/api-key-create-page.test.tsx,
  apps/web/src/admin/__tests__/api-keys-page.test.tsx
- work-packages/m14/164-the-new-api-key-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `ApiKeyCreatePage` — the own page of the new API key at
  `/admin/api-keys/new`
- `errorCode` — the error code of an API answer of the API keys
- `/admin/api-keys/new` — the route of the create page behind `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask of the
new API key was glued above the list of the keys, the same way the mask of the
new fault type was (WP-M14-162). The mask is a page of its own now, the list
offers a button that opens it.

1. `apps/web/src/admin/api-key-create-page.tsx` (new): `ApiKeyCreatePage` —
   the heading „Neuen Schlüssel anlegen", the name, the scopes, the date of
   the expiry, the error line and the button „Schlüssel anlegen". The page
   needs `apikey.write` and shows the one-time panel with the plaintext token
   after a successful `POST /v1/api-keys` — the server answers the token only
   once, so the panel stays on the page of the creation.
2. `apps/web/src/admin/api-keys-page.tsx`: the inline create form is gone; the
   list carries the button „Neuen Schlüssel anlegen", it leads to
   `/admin/api-keys/new`. The list, the revocation and the read-only notice
   stay as they are.
3. `apps/web/src/routes/index.tsx`: the route `/admin/api-keys/new` behind
   `RequireSession`.
4. The tests follow: the list test expects the button as a link, a new test
   proves the form on its own page and the one-time panel with the token.

## Non-goals

- No change of the revocation of a key and no change of the token panel.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `apiKeys.createTitle`, the link back carries `apiKeys.title`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the form on its own page and the
one-time panel with the token.

## Handoff

- Files changed: `apps/web/src/admin/api-key-create-page.tsx` (new),
  `apps/web/src/admin/api-keys-page.tsx` (the button instead of the inline
  form), `apps/web/src/routes/index.tsx` (the route), the two tests,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `ApiKeyCreatePage`, the route `/admin/api-keys/new`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: WP-M14-165 (the new webhook gets its own page) — its file is
  created with this commit (`AGENTS.md`, _Open follow-ups (mandatory closure)_)
- Open question: none
