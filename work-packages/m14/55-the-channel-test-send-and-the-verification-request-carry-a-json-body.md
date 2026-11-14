# WP-M14-55: The channel test send and the verification request carry a JSON body

format: small-model
status: done
depends-on: WP-M14-47, WP-M14-51
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/10-notifications.md §11.7 (Proof of the target), §11.11 (the API), §11.14 (the tests)
spec-lines: 20

files-read:

- specs/10-notifications.md §11.7, §11.11, §11.14
- apps/web/src/admin/channels-page.tsx (the two `jsonHeaders` POSTs without body)
- apps/web/src/lib/api.ts (`apiFetch`, `ApiError`)
- apps/api/src/notifications/routes.ts (the `/test` and `/verification` routes)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the fetch mock)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/__tests__/channels-page.test.tsx
- work-packages/m14/55-the-channel-test-send-and-the-verification-request-carry-a-json-body.md
- CHANGELOG.md, PLAN.md §16, work-packages/README.md, docs/REPO-MAP.md

interfaces:

- `POST /api/v1/admin/channels/:kind/test` receives `{}` from the administration
- `POST /api/v1/admin/channels/ntfy/verification` receives `{}`
- no new symbol, no new i18n key

## Task

The office saw `admin.channels.errors.FST_ERR_CTP_EMPTY_JSON_BODY` on the channel
card: the test send never reached the ntfy server and the one-time code could
never be sent, so the target stayed *unverified* and produced no outbox row.
`apiFetch` sends `content-type: application/json` while the body is absent, and
Fastify 5 rejects an empty body with that JSON content type **before** the route
runs — `channelTestRequestSchema.safeParse(request.body ?? {})` never sees the
request. The separate ntfy test topic of `eb3f6d7` removed the body together with
its field.

1. `requestVerification` sends `body: JSON.stringify({})` next to `jsonHeaders`.
2. The `test` mutation sends `body: JSON.stringify({})` — the saved row is the
   test target (WP-M14-51), so no `topic` override is sent from this page.
3. The page test asserts on the fetch mock that the call to `/test` and the call
   to `/verification` carry `body === '{}'`; both assertions fail before the
   change.
4. `docs/REPO-MAP.md` names the JSON body `{}` on both requests.

## Non-goals

- No change of `apiFetch` and no removal of `jsonHeaders`: the other bodyless
   POSTs (`logout`, `update/start`, swap actions, `bma-sync/run`) send no
   content type and are answered by Fastify anyway.
- No API, route, schema or permission change — the routes already accept an
   optional body.
- No i18n key for `FST_ERR_CTP_EMPTY_JSON_BODY`: it is a client defect, never a
   user-facing reason.
- No change of the verification UI, the QR, the curl block or the secret rules.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; the two new body assertions fail before the change.

## Handoff

- Files changed: `channels-page.tsx`, the page test, this WP document and the
  repository bookkeeping.
- Interfaces added: none — both requests now carry `{}`.
- Verified: `npm run check` green; an empty body with a JSON content type is
  answered `FST_ERR_CTP_EMPTY_JSON_BODY` by Fastify 5 (verified with `app.inject`),
  `{}` is accepted — before the change the two new body assertions fail.
- Follow-up WP: none.
- Open question: none.
