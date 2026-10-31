# Work Packages

A work package (WP) is the smallest complete implementation unit.
One WP = one model run = one commit. The binding plan is [`PLAN.md`](../PLAN.md);
the size limits are in `PLAN.md` §17 and `AGENTS.md`.

Naming: `work-packages/<phase-or-milestone>/<nr>-<slug>.md`
Dependencies: header `depends-on: WP-XX-YY, ...`

## Phases and milestones

| Directory | Content                                                                       | WPs |
| --------- | ----------------------------------------------------------------------------- | --- |
| [m0](m0/) | Phase 0: startability, plan anchor, Docker smoke test, image publishing       | 5   |
| [m1](m1/) | Phase 1: foundation (monorepo, Compose, DB, i18n, RBAC, auth, admin UI, CI)   | 26  |
| [m2](m2/) | Phase 2: report online (objects, QR, report form, status page, spam, offline) | 11  |

`m0` uses the small-model format (`format: small-model`), and so do `WP-M1-05`,
`WP-M1-06`, `WP-M1-07`, `WP-M1-07b`, `WP-M1-08`, `WP-M1-09`, `WP-M1-09b`, `WP-M1-09c`,
`WP-M1-09d`, `WP-M1-09e`, `WP-M1-10`,
`WP-M1-10b`, `WP-M1-10c`, `WP-M1-10d`, `WP-M1-10e`, `WP-M1-10f`, `WP-M1-10g`, `WP-M1-10h`,
`WP-M1-10i`, `WP-M1-11`, `WP-M1-15`, `WP-M2-00` and `WP-M2-01`. The
remaining `m1` and `m2` documents are legacy plans: they stay valid as scope
descriptions, but each one is rewritten into the small-model format before
implementation.

## Status

> **Current state:** **Phase 0 is complete** — **WP-M0-01**, **WP-M0-02**,
> **WP-M0-03**, **WP-M0-04** and **WP-M0-05** are implemented (local startability,
> resilient start order, binding plan anchor, repeatable Docker smoke test
> `scripts/docker-smoke.sh` with the guarded CI job `docker-smoke`, and the
> `build and push` workflow that publishes versioned GHCR images after `check`).
> The smoke run itself is proven by CI, because the development container has no
> Docker.
> In Phase 1 **WP-M1-01** until **WP-M1-08** are implemented (foundation, Compose,
> Drizzle base tables, i18n skeleton, RBAC tables + system role seed, bootstrap
> administrator seed with Argon2id, session core: token, token hash in `sessions`,
> delete-on-read of expired rows, cookie options, plus the auth HTTP layer:
> `sessionPlugin` with `request.user`, the `requireUser` preHandler and the
> login/logout/me routes with the login rate limit). The legacy auth package was
> rewritten into the small-model format and split, because it would have written six
> source files (`PLAN.md` §17: max. 3–4): **WP-M1-07** (implemented — shared login/me
> schemas and the session core) and **WP-M1-07b** (implemented — `sessionPlugin`,
> the `requireUser` preHandler and the login/logout/me routes with the login rate
> limit). `specs/01-rbac.md` gained §3.6 (session and `me`) for them.
> `specs/01-rbac.md` also gained §3.7 (permission guard) and **WP-M1-08**
> (`08-require-permission.md`) was rewritten into the small-model format and is
> implemented as well: effective permissions (role union, plus allows, minus
> denials) cached per request, `requirePermission` with OR semantics, the
> `permissions` array in login and `/me`, and the probe route that exists only when
> `NODE_ENV=test`.
> **WP-M1-09** (`09-admin-users-roles-ui.md`) was rewritten into the small-model
> format and split. The first package is implemented as the admin users API:
> `GET`, `POST` and `PATCH /api/v1/users` with `user.read` / `user.write` guards,
> shared user schemas, Argon2id password hashing, transactional role links,
> duplicate e-mail and unknown role key errors, and a last-active-admin guard. The
> role API, `usePermission`, the admin users UI and the admin roles UI move to
> WP-M1-09b–WP-M1-09d.
> **WP-M1-09b** (`09b-role-api.md`) is implemented as the admin roles API:
> `GET /api/v1/roles` plus `POST`, `PATCH` and `DELETE /api/v1/roles/:key` with
> `role.read` / `role.write` guards, shared role schemas, catalog-validated
> permission keys and the service-level guards of `specs/01-rbac.md` §3.5 — seeded
> system roles answer `409 system_role_protected`, a role still held by users
> `409 role_in_use`. `specs/01-rbac.md` gained §3.8 for it.
> **WP-M1-09c** (`09c-users-ui.md`) and **WP-M1-09d** (`09d-roles-ui.md`) are implemented as
> the admin UI on top of those APIs: `useMe`/`usePermission` in `apps/web/src/auth`, the
> `UsersPage` at `/admin/users` and the `RolesPage` at `/admin/roles` — role table with grant
> counts and user counts, create/edit/delete for custom roles, a permission checkbox grid
> built from `PERMISSION_KEYS`, and seeded system roles read-only.
> **WP-M1-09e** (`09e-login-form-guard.md`) closes the open login-UI question of WP-M1-07 and
> WP-M1-09: `LoginForm` and `LogoutButton` in `apps/web/src/auth/login-form.tsx`, the
> `RequireSession` guard wrapping both `/admin/*` routes, the signed-in state in the shell and
> the `common:auth.*` fixtures — the phase 1 exit criterion "login as admin works" is now
> reachable and WP-M1-12 can drive it.
> **WP-M1-10** (`10-ci-workflow.md`) was rewritten into the small-model format and
> shrunk: its CI, `LICENSE`, `README.md`, `CHANGELOG.md`, `dependabot.yml` and PR
> template items are already delivered (WP-M1-01, the deployment commits, WP-M0-05),
> so it now covers only the English CI step name and the German governance files
> (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`). The broken issue forms go
> to **WP-M1-10b** (implemented — the three `.github/ISSUE_TEMPLATE/` forms are valid
> GitHub issue forms again, with the 112-only emergency notice, and are ignored by
> Prettier), the German `docs/` placeholders to **WP-M1-10c** (implemented —
> `docs/ARCHITECTURE.md`, `docs/COMPLIANCE.md`, `docs/GLOSSARY.md` and `docs/I18N.md`
> are English and separate the live routes from the planned modules) and the German
> ADRs to **WP-M1-10d**.
> The example objects, systems and standard texts that
> the legacy WP-M1-06 also listed moved to the new **WP-M2-00**
> (`00-core-tables-seed.md`), because `PLAN.md` §16 puts objects in phase 2;
> `WP-M2-01` now depends on WP-M2-00 and WP-M2-00 waits for a filled
> `specs/02-data-model.md`. **WP-M1-10e** (`10e-follow-up-closure-rule.md`) is
> implemented as the governance rule _Open follow-ups (mandatory closure)_ in
> `AGENTS.md`, the _Current state and open backlog_ subsection in `PLAN.md` §16 and
> the table below. **WP-M1-10d** (`10d-adrs-english.md`) is implemented — `docs/DECISIONS.md`
> and both ADRs are English — and **WP-M1-11** (`11-repo-map.md`) is implemented as well:
> the legacy plan was rewritten into the small-model format and `docs/REPO-MAP.md` is now
> English throughout, lists every phase 1 module once, and matches the directory tree
> (168 lines, limit 200). With that every `docs/` file is English, so no language deviation
> is left. `WP-M1-12` implements the phase 1 exit criterion — its Playwright smoke test
> passes against a real throwaway database in German and in English, and phase 1 is closed
> once this commit is pushed; phase 2 has started with **WP-M2-00** — implemented: the four
> core object tables behind migration `0002_core_object_tables`, the localized
> `STANDARD_TEXTS` in `packages/shared/src/seed/` and the idempotent `seed-demo.ts`;
> `specs/02-data-model.md` was filled from `PLAN.md` §6 and reviewed (`object_no` is user
> input, unique over `lower(object_no)`, `_` allowed — `specs/02-data-model.md` §4.3.1).
> **WP-M2-01** adds the object list CRUD API (`/api/v1/objects` with search/filter,
> system sync and soft delete); `specs/08-objects-api.md` §9.1 was filled and reviewed
> for it. The remaining WPs are working plans and are implemented
> only after approval — WP by WP, never in bulk. A WP counts as done only when code,
> tests, lint, typecheck and docs agree and the corresponding commit is pushed.

## Open follow-ups

The table is the machine-readable backlog of record (rule: `AGENTS.md`
_Open follow-ups (mandatory closure)_). The status prose above is history only.
Update a row in the commit that adds, starts or finishes the item. Open items of the
running phase are implemented in numeric order before the next phase starts.

| WP        | Content                                                 | Status                  | WP file |
| --------- | ------------------------------------------------------- | ----------------------- | ------- |
| WP-M1-10f | traceable CI run, job and step names                    | done                    | yes     |
| WP-M1-10g | versioned run names for the publish chain               | superseded by WP-M1-10h | yes     |
| WP-M1-10h | CI on the version tag, version carried by the run name  | done                    | yes     |
| WP-M1-10i | publish run label carries one line of "what is new"     | done                    | yes     |
| WP-M1-09c | `usePermission` and the admin users UI                  | done                    | yes     |
| WP-M1-09d | admin roles UI                                          | done                    | yes     |
| WP-M1-09e | login form, logout button and route guard in `apps/web` | done                    | yes     |
| WP-M1-10d | English ADRs and `docs/DECISIONS.md`                    | done                    | yes     |
| WP-M1-11  | `docs/REPO-MAP.md` English and current                  | done                    | yes     |
| WP-M1-12  | Playwright smoke test "login as admin works"            | done                    | yes     |
| WP-M1-13  | UI layout shell with header and navigation              | done                    | yes     |
| WP-M1-14  | base seed keeps an existing administrator untouched     | done                    | yes     |
| WP-M2-00  | core object tables and demo seed                        | done                    | yes     |
| WP-M2-01  | object list CRUD API                                    | done                    | yes     |
| WP-M1-15  | app version visible in the web shell                    | done                    | yes     |

`WP-M1-10f` is implemented — the `run-name` labels, the `Resolve version tag` run
rename and the named jobs, steps and image summaries of both workflows are in place.
`WP-M1-10g` is superseded: it assumed a run can rename itself through the REST API. It
cannot — GitHub offers no such endpoint (the call answers `404`), and its `check` run never
saw the tag either, because `git push --follow-tags` pushes tag and commit in one go.
`WP-M1-10h` hangs the quality gates on the version tag push instead, so `run-name` renders
`v0.0.NN` from the first second and the publish run inherits that title as `publish v0.0.NN`.
`WP-M1-10i` adds the second half of that label: a `workflow_run` payload can only carry the
title of the calling run, so the green `check` run now ends with `Dispatch publish run`, which
starts `build.yml` through the `workflow_dispatch` REST endpoint with the version and the
commit subject as inputs — the publish run is titled `publish v0.0.NN · <commit subject>`, and
only a dispatch with `mode=check` moves `latest`.
`WP-M1-09c` is implemented — `useMe`/`usePermission` in `apps/web/src/auth`,
`UsersPage` at `/admin/users` and the `settings` namespace fixtures.
`WP-M1-09d` is implemented — `RolesPage` at `/admin/roles` on top of the role API, the
`settings:admin.roles.*` fixtures and the `204` handling of `apiFetch`.
`WP-M1-09e` is implemented — `LoginForm` and `LogoutButton` in `apps/web/src/auth/login-form.tsx`,
`RequireSession` in `apps/web/src/auth/require-session.tsx` guarding the two `/admin/*` routes,
the session state in the shell, and the `common:auth.*` fixtures (de and en complete). The
document `09e-login-form-guard.md` had been created while WP-M1-09d was finished — an announced
follow-up without a WP file is a defect.
`WP-M1-10d` is implemented — `docs/DECISIONS.md` (format note, template, index) and
ADR-0002 are English, the ADR slugs and ADR-0001 were already English from the
work-in-progress commit `b573fb5`, and the deviation note of `docs/REPO-MAP.md` now names
only the map itself as German.
`WP-M1-11` is implemented — the legacy plan was rewritten into the small-model format and
`docs/REPO-MAP.md` is English throughout: tree down to level 3 with the phase 1 folders and
the still-empty planned folders marked, one module row per existing module (including
`apps/api/src/index.ts`, `packages/shared/src/schemas/user.ts`, `packages/shared/src/i18n/t.ts`
and `apps/web/src/routes/index.tsx`, which the old table missed), the conventions short form
and the implementation status; 168 lines.
`WP-M1-12` needs `WP-M1-09e`, otherwise the phase 1 exit criterion
"login as admin works" cannot be tested.
`WP-M1-12` is done — its smoke E2E runs in a real browser against a real database.
`WP-M1-13` is done — the app has a layout shell (`apps/web/src/components/Shell.tsx`)
with a sticky header, a left navigation for the admin routes and a centred main area;
it reuses the existing `common` keys, so no locale file changed.
`WP-M1-14` is done — it repairs the base seed, which commit 82a9fc7 had broken: the
insert uses `onConflictDoNothing` again and the status is decided by looking the user
up before the insert, so an existing administrator keeps its `password_hash`, `locale`
and `active` and the second run reports `existing`. The red `check` runs
v0.0.58 … v0.0.61 were caused by that commit; v0.0.62 is green.
The phase 1 backlog is closed: every item in the table is `done`.
`WP-M1-15` is done — it repairs a regression of `WP-M1-13`: the layout-shell rewrite had
dropped the version line that commit 3e1c0f8 added. The shell header now renders
`AppVersion` on the login screen and on every guarded page; the value comes from the
existing `VITE_APP_VERSION` build argument, or from the nearest git tag in local builds.
`WP-M2-00` is done — on top of the reviewed `specs/02-data-model.md` (the `object_no`
decision is §4.3.1: user input, unique over `lower(object_no)`, `_` allowed) it added the
four core object tables, migration `0002_core_object_tables`, the localized
`STANDARD_TEXTS` in `packages/shared/src/seed/` and the idempotent `seed-demo.ts`.
`WP-M2-01` is done — the object list CRUD API in `apps/api/src/objects/service.ts`
answers `GET`, `GET /:objectNo`, `POST`, `PATCH /:objectNo` and `DELETE /:objectNo` under
`/api/v1/objects`, guarded by `object.read`/`object.write`/`object.delete`; the list
supports search and the `active`/`city`/`systemType` filters, PATCH syncs systems by id,
and DELETE is a soft delete (`active = false`). WP-M2-02 (QR generation and regeneration)
is the next phase 2 package and is rewritten into the small-model format before its
implementation.

## Validation

```bash
npm run wp:check
```

The check enforces the small-model limits for WPs with `format: small-model`:
max. 120 lines, max. 4 written source files, max. 6 read source files, context
budget max. 30k tokens, required metadata and sections. Legacy WPs are reported
and skipped until they are migrated.
