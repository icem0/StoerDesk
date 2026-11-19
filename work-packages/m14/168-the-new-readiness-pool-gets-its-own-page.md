# WP-M14-168: the new readiness pool gets its own page

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/08-oncall.md §4a.1; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-167

files-read:

- apps/web/src/admin/oncall-page.tsx (the pool section and its inline create form)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/i18n/locales/de/oncall.json (the texts of the pools)
- specs/08-oncall.md (§4a.1 the pools)
- docs/REPO-MAP.md (the module of the oncall page)
- work-packages/m14/167-the-new-transition-gets-its-own-page.md (the pattern)

files-write:

- apps/web/src/admin/oncall-pool-create-page.tsx
- apps/web/src/admin/oncall-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/admin/__tests__/oncall-pool-create-page.test.tsx
- work-packages/m14/168-the-new-readiness-pool-gets-its-own-page.md,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md

interfaces:

- `OncallPoolCreatePage` — the own page of the new readiness pool at
  `/admin/oncall/pools/new`
- `/admin/oncall/pools/new` — the route of the create page behind
  `RequireSession`

## Task

**The comment of the office (out of band in phase 14).** The input mask of the
new readiness pool was glued below the list of the pools, the same way the mask
of the new workflow step was (WP-M14-167). The mask is a page of its own now,
the list offers a button that opens it.

1. `apps/web/src/admin/oncall-pool-create-page.tsx` (new):
   `OncallPoolCreatePage` — the back link to the readiness administration and
   the form of a new pool (the name, the description, the members). The page
   needs `oncall.admin`, writes with `POST /v1/oncall/pools` and returns to the
   administration after a successful write.
2. `apps/web/src/admin/oncall-page.tsx`: the inline create form is gone; the
   pool section carries the button, it leads to `/admin/oncall/pools/new`. The
   pools, the members, the shifts and the settings stay as they are.
3. `apps/web/src/routes/index.tsx`: the route `/admin/oncall/pools/new` behind
   `RequireSession`.
4. The tests follow: a new test proves the form on its own page, the
   `POST /v1/oncall/pools` and the return to the administration.

## Non-goals

- No change of the shifts, of the members and of the settings of the readiness.
- No change of the API, of the schema or of the permissions.
- No new text: the button and the heading share the key
  `admin.pools.createTitle`, the link back carries the title of the readiness.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the form on its own page and the
return to the administration.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none — the comment of the office is closed
- Open question: none
