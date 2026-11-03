# WP-M2-47: API-key field on the BMAcloud sync page

format: small-model
status: planned
depends-on: WP-M2-45, WP-M2-46, ADR-0005
phase: 2
context-budget: 16k tokens
spec: specs/17-bmacloud-sync.md §17.5 (credentials, admin UI page), ADR-0005
spec-lines: 34

files-read:

- apps/web/src/admin/bma-sync-page.tsx — the trigger, the schedule form, the error mapping
- apps/web/src/admin/**tests**/bma-sync-page.test.tsx — the fetch stub and the fixtures
- apps/web/src/i18n/locales/de/settings.json — the `admin.bma.*` keys
- apps/web/src/i18n/locales/en/settings.json — the same keys in English
- packages/shared/src/schemas/bmacloud.ts — `BmaCredentialsResponse`, `BmaApiKeyRequest`
- apps/api/src/integrations/bmacloud/routes.ts — the credential routes of WP-M2-45

files-write:

- apps/web/src/admin/bma-sync-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/**tests**/bma-sync-page.test.tsx

interfaces:

- a credentials card on `/admin/bma-sync`: the current source (`db` / `env` / `none`), a
  write-only key field with `PUT /v1/admin/bma-sync/credentials` and a delete action with
  `DELETE /v1/admin/bma-sync/credentials`
- i18n: `admin.bma.credentials.*` in `de` and `en`

## Task

1. Read `GET /v1/admin/bma-sync/credentials` through a `useQuery` with the query key
   `['bma-sync', 'credentials']`; the value itself is never fetched, only
   `{ configured, source }`.
2. Add the card between the trigger and the schedule form: a line naming the source
   (stored in the database / from the environment / not set), one
   `type="password"` input with `autoComplete="off"`, a save button (mutation `PUT`,
   body `{ apiKey }`) and — only while `source === 'db'` — a delete button (`DELETE`).
   Both mutate and then invalidate the credentials query.
3. Gate the write controls on `usePermission('object.import')`; the card itself is
   visible with `object.read`. Keep the local field empty after a save: nothing ever
   refills it, because the API never answers the key.
4. Add the de/en keys `admin.bma.credentials.title`, `.hint`, `.source.db`, `.source.env`,
   `.source.none`, `.label`, `.save`, `.remove`, `.saved`; the `bma_not_configured` error
   text stays as it is and the hint now points to this field.
5. Extend the page test: the credentials stub in `baseRoutes`, the source line for `env`,
   a save that `PUT`s the typed key and shows the `db` source afterwards, the delete
   button only for `source: 'db'`, and the write controls disabled with `object.read` only.

## Non-goals

- No new route or schema — the API is WP-M2-45.
- No key display, no "show key" toggle, no copy button: the value is write-only
  (ADR-0005).
- No credential card on the administration home (WP-M2-38 card stays as it is).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page test runs in jsdom and asserts the two mutations.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
