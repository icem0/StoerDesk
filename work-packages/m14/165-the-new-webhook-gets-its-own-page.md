# WP-M14-165: the new webhook gets its own page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/08-objects-api.md §9.6; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-164

files-read:

- apps/web/src/admin/webhooks-page.tsx (the list and the inline create form)
- apps/web/src/admin/__tests__/webhooks-page.test.tsx (the tests of the list)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/settings.json (the texts of the webhooks)
- specs/08-objects-api.md (§9.6 the webhooks)
- docs/REPO-MAP.md (the module of the webhooks page)

files-write:

- apps/web/src/admin/webhook-form-parts.tsx, apps/web/src/admin/webhook-create-page.tsx
- apps/web/src/admin/webhooks-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/webhook-create-page.test.tsx,
  apps/web/src/admin/__tests__/webhooks-page.test.tsx
- work-packages/m14/165-the-new-webhook-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `WebhookCreatePage` — the own page of the new webhook at
  `/admin/webhooks/new`
- `webhook-form-parts.tsx` — `errorMessage`, `jsonHeaders` — the parts that the
  list and the create page share
- `/admin/webhooks/new` — the route of the create page behind `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask of the
new webhook was glued above the list of the webhooks, the same way the mask of
the new API key was (WP-M14-164). The mask is a page of its own now, the list
offers a button that opens it.

1. `apps/web/src/admin/webhook-form-parts.tsx` (new): the parts that the list
   and the create page share — the `errorMessage` of the error codes of the
   webhooks and the `jsonHeaders`.
2. `apps/web/src/admin/webhook-create-page.tsx` (new): `WebhookCreatePage` —
   the heading, the url, the secret, the events, the error line and the button.
   The page needs `settings.write`, offers a link back to the list and returns
   to the list after a successful `POST /v1/webhooks`.
3. `apps/web/src/admin/webhooks-page.tsx`: the inline create form is gone; the
   list carries the button under the heading, it leads to
   `/admin/webhooks/new`. The list, the secret panel, the editing and the
   delete stay as they are.
4. `apps/web/src/routes/index.tsx`: the route `/admin/webhooks/new` behind
   `RequireSession`.
5. The tests follow: a new test proves the form on its own page, the `POST
   /v1/webhooks` and the return to the list.

## Non-goals

- No change of the editing of a webhook: the edit form stays below the list.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `webhooks.createTitle`, the link back carries `webhooks.title`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the form on its own page and the
return to the list.

## Handoff

- Files changed: `apps/web/src/admin/webhook-form-parts.tsx` (new),
  `apps/web/src/admin/webhook-create-page.tsx` (new),
  `apps/web/src/admin/webhooks-page.tsx` (the button instead of the inline
  form), `apps/web/src/routes/index.tsx` (the route), the two tests,
  `docs/REPO-MAP.md`, `PLAN.md` §16, `CHANGELOG.md`,
  `work-packages/README.md`, this document
- Interfaces added: `WebhookCreatePage`, the route `/admin/webhooks/new`, the
  shared parts of `webhook-form-parts.tsx`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors),
  `npm run i18n:check`, `npm run test:run` and `npm run wp:check` green
- Follow-up WP: none — the comment of the office is closed
- Open question: none
- Follow-up WP: none — the comment of the office is closed
- Open question: none
