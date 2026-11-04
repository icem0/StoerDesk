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
| [m1](m1/) | Phase 1: foundation (monorepo, Compose, DB, i18n, RBAC, auth, admin UI, CI)   | 40  |
| [m2](m2/) | Phase 2: report online (objects, QR, report form, status page, spam, offline) | 71  |
| [m3](m3/) | Phase 3: offline sync closure and the host update image clean-up            | 8   |
| [m4](m4/) | Phase 4: ticket workflow online — E2E test for the complete workflow          | 1   |
| [m5](m5/) | Phase 5: offline internal actions — queue, receipts, replay, conflicts | 9  |
| [m7](m7/) | Phase 7 (planned): ntfy channel adapter, channel test, ntfy onboarding        | 3   |

Every `m0`, `m1`, `m2` and `m3` document carries `format: small-model` except the four first
foundation scope documents `WP-M1-01` … `WP-M1-04`; `npm run wp:check` reports those four
as legacy and skips them. A package that was rewritten from a legacy plan and split is
recognisable by its children: `WP-M1-07` → `WP-M1-07b`, `WP-M1-09` → `WP-M1-09b` …
`WP-M1-09e`, `WP-M1-10` → `WP-M1-10b` … `WP-M1-10e`, `WP-M2-02` → `WP-M2-02b`,
`WP-M2-04` → `WP-M2-04b`/`WP-M2-04c`, `WP-M2-05` → `WP-M2-05b`/`WP-M2-05c`, `WP-M2-06` →
`WP-M2-06b`, `WP-M2-07` → `WP-M2-07b` … `WP-M2-07d`, `WP-M2-19` → `WP-M2-19a` …
`WP-M2-19d`. `WP-M1-23` … `WP-M1-27` are **retroactive records**: they do not announce
work, they document phase 1 commits that landed without a work package, so that the
record is complete (`AGENTS.md`, _Open follow-ups (mandatory closure)_).

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
> for it. **WP-M2-02** is implemented as the QR token layer: `apps/api/src/objects/qr.ts`
> generates the 22-character token on create, `POST /:objectNo/regenerate-qr` retires the
> old token in `old_qr_tokens` (migration `0003_old_qr_tokens`) for 30 days or immediately,
> and public `GET /api/v1/public/qr/:token` resolves current and retired active tokens;
> `specs/08-objects-api.md` §9.2 and `specs/02-data-model.md` §4.7 carry the contract, and
> its split child **WP-M2-02b** is implemented as well: the demo seed generates and
> backfills `qr_token`, and `deleteExpiredQrTokens` runs daily through the pg-boss queue
> `qr-token-cleanup`. **WP-M2-03** is implemented as the printable QR sticker sheets of the
> web app: `StickerPage` at `/objects/stickers` prints A6 or A4 sheets through
> `window.print()` — QR of `<origin>/m/<token>`, object name, object number, report call
> and the 112 notice on every card — and `specs/08-objects-api.md` §9.3 was filled and
> reviewed for it.
> The phase 1 record is closed: every `m1` document now carries a `status:` line, and
> **WP-M1-23** … **WP-M1-27** are retroactive records for the seven phase 1 commits that
> landed without a work package.
> The phase 2 record is closed the same way: **WP-M2-32** records commit `a6804ed`, which
> landed the BMAcloud contract (`specs/17-bmacloud-sync.md`, ADR-0003, the `PLAN.md` §11
> block) with neither a work package nor a WP id in its subject, and it deletes the stray
> `apps/web/apps/web/src/__tests__/diag.test.tsx` that commit committed outside the source
> tree. `a6804ed` wrote **no implementation** — no client, no `bma_sync_runs` table, no
> `BMA_*` environment key, no route, no page — so the plan text of §11 is documentation
> until **WP-M2-33** … **WP-M2-39** (created with the record) are implemented; **WP-M2-33**
> (the read-only client and its `BMA_*` environment) is done. The stale
> `status:` lines of `09` … `31` now say what the code already does, and the stale
> `Follow-up WP:` line of `26` is corrected: it named a file that never existed.
> The remaining WPs are working plans and are implemented
> only after approval — WP by WP, never in bulk. A WP counts as done only when code,
> tests, lint, typecheck and docs agree and the corresponding commit is pushed.

## Open follow-ups

The table is the machine-readable backlog of record (rule: `AGENTS.md`
_Open follow-ups (mandatory closure)_). The status prose above is history only.
Update a row in the commit that adds, starts or finishes the item. Open items of the
running phase are implemented in numeric order before the next phase starts.

| WP        | Content                                                             | Status                  | WP file |
| --------- | ------------------------------------------------------------------- | ----------------------- | ------- |
| WP-M1-01  | monorepo workspaces, strict TS, ESLint/Prettier/Vitest              | done                    | yes     |
| WP-M1-02  | Compose stack, `Dockerfile`, complete `.env.example`                | done                    | yes     |
| WP-M1-03  | Drizzle base schema, `0000_base_tables`, UUID v7                    | done                    | yes     |
| WP-M1-04  | i18n skeleton, server `t()`, `i18n:check`, lint rule                | done                    | yes     |
| WP-M1-05  | RBAC tables, `0001_rbac_tables`, system role seed                   | done                    | yes     |
| WP-M1-06  | Argon2id hash and the bootstrap administrator seed                  | done                    | yes     |
| WP-M1-07  | session core and the shared auth schemas                            | done                    | yes     |
| WP-M1-07b | `sessionPlugin`, `requireUser`, login/logout/me, limit              | done                    | yes     |
| WP-M1-08  | effective permissions and `requirePermission`                       | done                    | yes     |
| WP-M1-09  | admin users API (list, create, update)                              | done                    | yes     |
| WP-M1-10  | English CI step names and governance files                          | done                    | yes     |
| WP-M1-10b | valid GitHub issue forms with the 112-only notice                   | done                    | yes     |
| WP-M1-10c | English `docs/` placeholders                                        | done                    | yes     |
| WP-M1-10f | traceable CI run, job and step names                                | done                    | yes     |
| WP-M1-10g | versioned run names for the publish chain                           | superseded by WP-M1-10h | yes     |
| WP-M1-10h | CI on the version tag, version carried by the run name              | done                    | yes     |
| WP-M1-10i | publish run label carries one line of "what is new"                 | done                    | yes     |
| WP-M1-09c | `usePermission` and the admin users UI                              | done                    | yes     |
| WP-M1-09d | admin roles UI                                                      | done                    | yes     |
| WP-M1-09e | login form, logout button and route guard in `apps/web`             | done                    | yes     |
| WP-M1-10d | English ADRs and `docs/DECISIONS.md`                                | done                    | yes     |
| WP-M1-11  | `docs/REPO-MAP.md` English and current                              | done                    | yes     |
| WP-M1-12  | Playwright smoke test "login as admin works"                        | done                    | yes     |
| WP-M1-13  | UI layout shell with header and navigation                          | done                    | yes     |
| WP-M1-14  | base seed keeps an existing administrator untouched                 | done                    | yes     |
| WP-M2-00  | core object tables and demo seed                                    | done                    | yes     |
| WP-M2-01  | object list CRUD API                                                | done                    | yes     |
| WP-M2-02  | QR generation, regeneration, public resolution                      | done                    | yes     |
| WP-M2-02b | QR demo tokens and daily pg-boss cleanup                            | done                    | yes     |
| WP-M2-03  | printable QR sticker sheets (A6/A4 web print)                       | done                    | yes     |
| WP-M1-15  | app version visible in the web shell                                | done                    | yes     |
| WP-M1-16  | current git version in the deployment environment                   | done                    | yes     |
| WP-M1-17  | responsive shell with a settings gear next to version               | done                    | yes     |
| WP-M2-04  | ticket tables, events, photos and the counter                       | done                    | yes     |
| WP-M2-04b | public `POST /api/v1/public/tickets` with idempotency               | done                    | yes     |
| WP-M2-04c | report photo upload to the uploads volume                           | done                    | yes     |
| WP-M2-05  | public report form UI at `/m/:token` (web)                          | done                    | yes     |
| WP-M2-05b | photo upload with client canvas compression                         | done                    | yes     |
| WP-M2-05c | report form smoke E2E in de and en                                  | done                    | yes     |
| WP-M2-06  | public ticket status API by `status_token`                          | done                    | yes     |
| WP-M2-06b | public status page at `/s/:token` (web)                             | done                    | yes     |
| WP-M2-07  | report throttle table and suspicion detection                       | done                    | yes     |
| WP-M2-07b | Altcha captcha API primitives                                       | done                    | yes     |
| WP-M2-07c | spam decision on the report create path                             | done                    | yes     |
| WP-M2-07d | honeypot field and Altcha widget in the form (web)                  | done                    | yes     |
| WP-M2-08  | duplicate hint: open tickets and public comment                     | done                    | yes     |
| WP-M2-09  | offline report — Dexie outbox and send flow                         | done                    | yes     |
| WP-M2-09a | service worker and offline sync                                     | done                    | yes     |
| WP-M2-09b | offline E2E test                                                    | done                    | yes     |
| WP-M2-10  | phase 2 exit-criterion E2E (report → status page)                   | done                    | yes     |
| WP-M2-11  | object list UI (read): searchable, filterable table                 | done                    | yes     |
| WP-M2-12  | object create UI                                                    | done                    | yes     |
| WP-M2-13  | object edit UI                                                      | done                    | yes     |
| WP-M2-14  | object delete UI (soft delete)                                      | done                    | yes     |
| WP-M2-15  | internal ticket creation API (server)                               | done                    | yes     |
| WP-M2-16  | internal ticket creation UI (web)                                   | done                    | yes     |
| WP-M2-17  | ticket list API (server)                                            | done                    | yes     |
| WP-M2-17b | ticket list UI (web)                                                | done                    | yes     |
| WP-M2-18a | ticket detail API (server)                                          | done                    | yes     |
| WP-M2-18b | ticket detail UI (web)                                              | done                    | yes     |
| WP-M2-19a | DB migration for ticket workflow columns                            | done                    | yes     |
| WP-M2-19b | transitionTicket() state machine                                    | done                    | yes     |
| WP-M2-19c | workflow API routes                                                 | done                    | yes     |
| WP-M2-19d | workflow UI actions                                                 | done                    | yes     |
| WP-M2-20  | navigation for tickets and objects                                  | done                    | yes     |
| WP-M2-21  | ticket list filters (open, overdue) and ordering                    | done                    | yes     |
| WP-M2-22  | start page with ticket capture as primary action                    | done                    | yes     |
| WP-M2-23  | ticket list links and query parameters                              | done                    | yes     |
| WP-M2-24  | administration home page                                            | done                    | yes     |
| WP-M1-18  | publish chain: no cancelled run, correct `latest`                   | done                    | yes     |
| WP-M1-19  | one tag per push for every commit                                   | done                    | yes     |
| WP-M1-20  | the push command in the governance documents                        | done                    | yes     |
| WP-M1-21  | serialised promotion of `latest`                                    | done                    | yes     |
| WP-M1-22  | the app version reads version tags only                             | done                    | yes     |
| WP-M1-23  | record of the login card and version display (3e1c0f8)              | done                    | yes     |
| WP-M1-24  | record of the RBAC/admin bootstrap on API start (71fd066)           | done                    | yes     |
| WP-M1-25  | record of the CI db tests and publish queue (3 commits)             | done                    | yes     |
| WP-M1-26  | record of the configurable login rate limit (2 commits)             | done                    | yes     |
| WP-M1-27  | record of the end-of-session commit rule (7e64dd1)                  | done                    | yes     |
| WP-M2-25  | grouped settings menu in the shell                                  | done                    | yes     |
| WP-M2-26  | back links in the admin pages                                       | done                    | yes     |
| WP-M2-27  | show a hint when internal ticket creation fails                     | done                    | yes     |
| WP-M2-28  | logo and top-level buttons in the shell header                      | done                    | yes     |
| WP-M2-29  | branding settings API (company name)                                | done                    | yes     |
| WP-M2-30  | branding input field in the administration                          | done                    | yes     |
| WP-M2-31  | company name in the shell header                                    | done                    | yes     |
| WP-M2-32  | record of the BMAcloud decision commit `a6804ed`                    | done                    | yes     |
| WP-M2-33  | BMAcloud read-only client and its environment                       | done                    | yes     |
| WP-M2-34  | the `bma_sync_runs` table (migration `0007`)                        | done                    | yes     |
| WP-M2-35  | the BMAcloud sync service (mapping, conflicts)                      | done                    | yes     |
| WP-M2-36  | BMAcloud admin API and the scheduled sync job                       | done                    | yes     |
| WP-M2-36b | `GET /admin/bma-sync/schedule` for the page prefill                 | done                    | yes     |
| WP-M2-37  | BMAcloud sync page in the administration                            | done                    | yes     |
| WP-M2-38  | BMAcloud sync card on the administration home                       | done                    | yes     |
| WP-M2-39  | external-maintained badge in the object list                        | done                    | yes     |
| WP-M2-40  | fault template archive schema and shared contracts                  | done                    | yes     |
| WP-M2-40b | fault template admin and public catalog API                         | done                    | yes     |
| WP-M2-40c | fault template administration UI                                    | done                    | yes     |
| WP-M2-40d | fault template entry on the administration home                     | done                    | yes     |
| WP-M2-40e | public report form uses the live fault catalog                      | done                    | yes     |
| WP-M2-40f | internal create and detail use the live fault catalog               | done                    | yes     |
| WP-M2-41  | bootstrap standard fault types                                      | done                    | yes     |
| WP-M2-41b | E2E fault-chip labels of the bootstrap list                         | done                    | yes     |
| WP-M2-42  | bootstrap the standard fault types on the API start                 | done                    | yes     |
| WP-M2-43  | self-update decision (ADR-0004), spec 18 and WP plan                | done                    | yes     |
| WP-M2-44  | admin update page — clean PWA update (stage 1)                      | done                    | yes     |
| WP-M2-45  | BMAcloud bearer key in `settings` and its admin routes              | done                    | yes     |
| WP-M2-46  | the scheduled pull reads the effective bearer key                   | done                    | yes     |
| WP-M2-47  | API-key field on the BMAcloud sync page                             | done                    | yes     |
| WP-M2-48  | host update agent decision (ADR-0006) and work plan                 | done                    | yes     |
| WP-M2-49  | shared contracts: `system.update` and the update schemas            | done                    | yes     |
| WP-M2-50  | the `update_runs` table and migration `0009`                        | done                    | yes     |
| WP-M2-51  | the update agent service core (`apps/agent`)                        | done                    | yes     |
| WP-M2-52  | the update agent HTTP server                                        | done                    | yes     |
| WP-M2-53  | the agent image, compose service and env wiring                     | done                    | yes     |
| WP-M2-53b | the compose invocation of the agent and its image in the smoke test | done                    | yes     |
| WP-M2-54  | the admin update API                                                | done                    | yes     |
| WP-M2-55  | the host update section in the admin update page                    | done                    | yes     |
| WP-M2-56  | documentation of the host update                                    | done                    | yes     |
| WP-M2-57  | the status route names the reason of an unreachable agent           | done                    | yes     |
| WP-M2-58  | the page shows why the agent is not reachable                       | done                    | yes     |
| WP-M2-59  | the agent generates its own token (state volume)                    | done                    | yes     |
| WP-M2-60  | the API reads the token from the state volume                       | done                    | yes     |
| WP-M2-61  | the admin page carries the guide for the host update                | done                    | yes     |
| WP-M2-62  | documentation of the token without the environment                  | done                    | yes     |
| WP-M2-63  | the update availability check of the admin page                     | done                    | yes     |
| WP-M2-64  | objects.external_type behind migration 0010                         | done                    | yes     |
| WP-M2-65  | the BMAcloud contract knows the Anlagentyp                          | done                    | yes     |
| WP-M2-65b | the sync writes the external system type                            | done                    | yes     |
| WP-M2-66  | the object list shows the system type                               | done                    | yes     |
| WP-M2-67  | the migration snapshot chain is complete again                      | done                    | yes     |
| WP-M2-68  | the update run carries the failure output of the agent              | done                    | yes     |
| WP-M2-69  | `update_runs.error_detail` and the API answer                       | done                    | yes     |
| WP-M2-70  | the host update page shows the failure output                       | done                    | yes     |
| WP-M2-71  | the host update works in panel (Arcane) deployments                 | done                    | yes     |
| WP-M2-72  | the host update runs as a shell script without the agent            | done                    | yes     |
| WP-M2-73  | the panel build fetches the current sources                         | done                    | yes     |
| WP-M2-74  | the host update shows the version and starts with a button          | done                    | yes     |
| WP-M2-75  | `ticket.delete` permission key (admin only)                         | done                    | yes     |
| WP-M2-76  | `ticket_purges` append-only log of hard-deleted tickets             | done                    | yes     |
| WP-M2-77  | `DELETE /api/v1/tickets/:ticketNo` for cancelled tickets            | done                    | yes     |
| WP-M2-78  | "Endgültig löschen" button on the ticket detail page                | done                    | yes     |
| WP-M3-01  | offline background sync matches the API path                        | done                    | yes     |
| WP-M3-02  | the update script removes the images it replaces                    | done                    | yes     |
| WP-M3-02b | the update agent removes the images it replaces                     | done                    | yes     |
| WP-M3-03  | the agent start command finds the project dir on the host           | done                    | yes     |
| WP-M3-04  | the start command pins `--project-directory` and fills `.env`       | done                    | yes     |
| WP-M3-04b | der Startbefehl bricht ohne `docker-compose.yml` ab                 | done                    | yes     |
| WP-M3-05  | shared error code `update_step_timeout` for self-update           | done                    | yes     |
| WP-M3-06  | the update agent run can never hang forever                       | done                    | yes     |
| WP-M4-01  | Ticket workflow E2E test — complete workflow with audit trail       | done                    | yes     |
| WP-M5-01  | the outbox stores queued internal actions (Dexie v2)                | done                    | yes     |
| WP-M5-02  | `internal_action_receipts` table and migration 0013                 | planned                 | yes     |
| WP-M5-03  | `applyInternalAction`: replay-safe acknowledge/comment/decline      | planned                 | yes     |
| WP-M5-04  | `clientUuid` on the action routes + internal comment route          | planned                 | yes     |
| WP-M5-05  | the detail page queues actions offline and replays them             | planned                 | yes     |
| WP-M5-06  | conflict UI: failed and conflicting offline writes stay visible     | planned                 | yes     |
| WP-M5-07  | stale-while-revalidate cache for internal ticket reads              | planned                 | yes     |
| WP-M5-08  | offline internal actions E2E — phase 5 exit criterion               | planned                 | yes     |
| WP-M5-09  | sign-out clears the `internal-tickets` cache                        | planned                 | yes     |

`WP-M1-23` … `WP-M1-27` close the last phase 1 record gaps: seven commits landed in
phase 1 without a work package and without a WP id in the commit subject —
`3e1c0f8` (centred login card, version display), `71fd066` (RBAC and administrator
bootstrap on API start), `f0e0fcc`, `1d56aad` and `d994911` (Postgres service in the
`check` job, the dead Playwright job, the publish queue), `4da1c7b`/`ad0b45b`
(configurable login rate limit) and `7e64dd1` (the end-of-session commit rule). The five
records say what each commit did and what of it is no longer true — the global
`publish-queue` and "every run moves `latest`" of `d994911` were repaired by WP-M1-18 and
WP-M1-21, and the `VITE_APP_VERSION` build argument of `3e1c0f8` was replaced by the
tracked `VERSION` file of WP-M1-16. `WP-M1-26` additionally closes the gap those commits
left: `LOGIN_RATE_LIMIT_MAX` and `LOGIN_RATE_LIMIT_WINDOW` were missing from
`.env.example` (`PLAN.md` §15 requires it to be complete). `82a9fc7` (the seed defect
WP-M1-14 repaired) and the version-file commits `c51f060` and `0ca83e4` carry no WP of
their own and are recorded in the handoff of WP-M1-14 and WP-M1-16. The commits before
the work-package rule existed (`fe417df`, `22a8bf6`, `0179bf8`, `3b1872a`, `42d4d35`,
`80124d8` and the deployment fixes of 2026-10-28/29) stay unrecorded history: their scope
is `WP-M1-01`, `WP-M1-02` and `WP-M0-01`/`WP-M0-02`.
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
commit subject as inputs — the publish run is titled `publish v0.0.NN · <commit subject>`.
Every publish run moves `latest`, whether it was dispatched by a green `check` run or
started manually.
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
`AppVersion` on the login screen and on every guarded page. The value is the application
version produced by the development workflow, not a frontend version.
`WP-M1-16` is done — the pre-commit hook writes the next version into the tracked
`VERSION` file and the post-commit hook tags exactly that value. Image builds read
`VERSION`, so deployment panels need no `.env` entry; the former `env:version` script and
the git-tag refresh are gone.
`WP-M1-17` is done — the shell drops the permanent sidebar for a full-width, phone-first
layout: a 44 × 44 px gear next to the version opens a dropdown with the signed-in account,
the user, role and sticker pages, and logout; the menu closes on route change, Escape and a
click outside, and the admin tables scroll horizontally on phone widths.
`WP-M2-00` is done — on top of the reviewed `specs/02-data-model.md` (the `object_no`
decision is §4.3.1: user input, unique over `lower(object_no)`, `_` allowed) it added the
four core object tables, migration `0002_core_object_tables`, the localized
`STANDARD_TEXTS` in `packages/shared/src/seed/` and the idempotent `seed-demo.ts`.
`WP-M2-01` is done — the object list CRUD API in `apps/api/src/objects/service.ts`
answers `GET`, `GET /:objectNo`, `POST`, `PATCH /:objectNo` and `DELETE /:objectNo` under
`/api/v1/objects`, guarded by `object.read`/`object.write`/`object.delete`; the list
supports search and the `active`/`city`/`systemType` filters, PATCH syncs systems by id,
and DELETE is a soft delete (`active = false`). `WP-M2-02` is done — `qr.ts` generates
22-character `base64url` tokens on create, `POST /:objectNo/regenerate-qr` (guarded by
`object.regenerate_qr`) moves the old token to `old_qr_tokens` with `expires_at = now +
30 days` (`blockOldToken: true` blocks it now), and public `GET /api/v1/public/qr/:token`
resolves current and retired active tokens for the web route `/m/:token`. The split child
`WP-M2-02b` is done too — it was split off because the parent had to stay inside the
four-source-file budget: `seed-demo.ts` now generates a `qr_token` for every inserted demo
object and backfills a `NULL` token without ever touching an existing one, and
`apps/api/src/jobs/qr-cleanup.ts` deletes expired `old_qr_tokens` rows through the pg-boss
queue `qr-token-cleanup` on the cron `0 3 * * *`, started only from the direct API start
and stopped by an `onClose` hook.
`WP-M2-04` is rewritten into the small-model format and split, because the legacy plan
mixed schema, service, route, rate limit and tests in one package (`PLAN.md` §17: max.
3–4 source files): **WP-M2-04** adds the four ticket tables behind migration
`0004_ticket_tables`, the `next_ticket_no()` counter (`ST-<year>-<counter>`) and the
append-only trigger of `ticket_events` — **implemented**, and its trigger learned one
exception from the integration test: a `BEFORE DELETE` trigger also fires for the
`ON DELETE CASCADE` of the ticket, so only a direct `DELETE` raises
`ticket_event_append_only` (`specs/02-data-model.md` §4.9);
**WP-M2-04b** (`04b-public-report-api.md`) adds
the public `POST /api/v1/public/tickets` with the `client_uuid` idempotency —
**implemented** — and **WP-M2-04c** (`04c-report-photo-upload.md`) adds the photo files
and the `ticket_photos` rows — **implemented** as the magic-byte check, the
`UPLOAD_MAX_BYTES` cap over the decoded size and the codes
`photo_limit_exceeded`/`photo_too_large`/`photo_type_unsupported`; the spec rule of §4.10
was clarified in the same commit: the file name is the UUID v4 of the upload, not the row id. The
rate limit per IP and per QR token of the legacy plan moves to the **existing WP-M2-07**
(spam protection), which also defines "suspicious" and writes `suspected_spam`
(`specs/06-report-form.md` §7.6). The spec slices it needed were placeholders and are
filled and reviewed first: `specs/06-report-form.md` (chapter 7) and
`specs/02-data-model.md` §4.8–§4.11.
`WP-M2-05` is rewritten into the small-model format and split as well: the legacy plan put
the route, six components, the client compression, the confirmation page and two Playwright
tests into one package, which is far over the four-source-file and 300-line limits.
**WP-M2-05** (`05-report-form-ui.md`) is implemented as the public form itself —
`ReportFormPage` at the
unguarded route `/m/:token` with the prefilled object header, the system select, the fault
chips over `STANDARD_TEXT_KEYS`, the free text, the contact fields, the 112 notice and the
confirmation with the ticket number and the `/s/<statusToken>` link. Its child
**WP-M2-05b** (`05b-report-photo-upload-ui.md`) is implemented as the canvas compression to
1600 px/JPEG 0.8 (`image-compress.ts`) and the six-photo uploader of §7.4
(`photo-upload.tsx`, data URLs in the submit body, the three photo error codes and the
`photoCount` on the confirmation). **WP-M2-05c** (`05c-report-form-e2e.md`) is implemented
as the report form smoke E2E: it signs in as the administrator, creates the object through
`POST /api/v1/objects`, drives `/m/<token>` on a 375×667 viewport in `de` and `en`, attaches
a real JPEG in one run (canvas compression and server magic-byte check) and asserts the
ticket number, the `/s/<status_token>` link and the photo count. **WP-M2-06** is rewritten
into the small-model format and split as well: the legacy plan mixed the public status API,
the page and its tests into one package. **WP-M2-06** (`06-status-page.md`) is implemented as
the status API — `GET /api/v1/public/tickets/:token/status` answering the ticket number, the
current
status, the deadline and only the whitelisted event types (`created`, `work_order_set`,
`accepted`, `acknowledged`, `closed`) as `{ type, at }`, never an event payload, an actor or
an internal comment. Its child **WP-M2-06b** (`06b-status-page-ui.md`) is implemented as the public `StatusPage`
at `/s/:token` — ticket number, status badge with a text label, deadline and the timeline in
`de` and `en`. The duplicate hint stays with WP-M2-08, the offline outbox with WP-M2-09.
**WP-M2-07** is rewritten into the small-model format and split before implementation: the
legacy package bundled the throttle, the honeypot, the Altcha verification, the create-path
decision and the form into one run, far over the source-file and line limits. **WP-M2-07**
(`07-spam-protection.md`) is implemented as the report throttle: migration
`0005_report_throttle` adds the append-only `report_throttle` table and
`apps/api/src/tickets/spam.ts` provides `recordReportAttempt`, `recentReportCount` (the higher
of the per-IP and the per-token count inside the window) and `isReportSuspicious` (> 3 reports
per 10 minutes per IP **or** QR token) — detection only, no route reads it yet. Its children,
all created in this same rewrite commit, are **WP-M2-07b**
(`07b-altcha-captcha-api.md`) — implemented as the `altcha-lib` challenge/verify primitives and
the `altchaVerificationSchema` — **WP-M2-07c** (`07c-spam-decision-report-path.md`) —
implemented as the honeypot, throttle and Altcha decision on the create path, storing a
suspicious or honeypot report with `tickets.suspected_spam` and answering
`400 captcha_required` for a suspicious report without a valid proof of work — and
**WP-M2-07d** (`07d-spam-form-ui.md`) — implemented as the hidden `website` honeypot of the
public form and the Altcha widget that appears only after a `400 captcha_required`: the
challenge is fetched from `POST /api/v1/public/altcha/challenge`, the solved proof of work
travels back in the `verification` field of the next attempt, and the widget itself is loaded
on demand — a reporter of a normal report never sees a captcha.
`WP-M2-08` is done — it is the duplicate hint of `specs/06-report-form.md` §7.8 and it
was implemented in **one** package, without a split into `08a`/`08b`: the open tickets of
the object come from `GET /api/v1/public/tickets/open` (the current QR token of an active
object, closed, cancelled and suspected spam tickets stay hidden), and
`POST /api/v1/public/tickets/:ticketNo/comments` appends the text of the reporter to an
open ticket of that object as one append-only `comment` event — the QR token of the object
is the capability, so the `status_token` of a foreign ticket is never handed out. The
public form shows the hint with one "Ergänzen" button per open ticket and one "Trotzdem
neu melden" button, and every new report of an object with an open ticket carries the
`parentTicketId` of the oldest open ticket in `tickets.parent_ticket_id`.
`WP-M1-18` is done — it repairs the publish chain of the GitHub Actions. All publish runs
shared the concurrency group `publish-queue`; GitHub keeps only one pending run per group and
cancels the previous pending one, so a queued publish run disappeared without publishing its
version (`v0.0.87` and `v0.0.97` have no images in GHCR). Every version now has its own
group `publish-<version>`. The build writes only the version tags of its commit; a new
promotion step reads the registry, takes the highest version tag that exists there and points
`latest` at it with `docker buildx imagetools create`, so `latest` no longer depends on which
build finished last — it pointed to `v0.0.98` while `v0.0.99` was already published. The
check run writes version, commit and subject into its job summary, because the title of a tag
push is the bare version.
`WP-M1-19` is done — GitHub creates no tag push event when more than three tags are pushed
at once, so the session of 2026-11-02 pushed seven tags in one `git push --follow-tags` and
the versions `v0.0.93`, `v0.0.94` and `v0.0.95` never got a check run at all. The new
`npm run release:push` pushes the branch and every missing tag one tag per push, so every
commit gets its own run; the hint of the post-commit hook points to it.
`WP-M1-20` is done — `AGENTS.md`, `PLAN.md` §18.3 and `CONTRIBUTING.md` name
`npm run release:push` instead of `git push --follow-tags` and carry the rule "one tag per
push" with the GitHub limitation behind it.
`WP-M1-22` is done — the check run of the release `v0.1.0` was red: the fallback of the app version read the nearest tag with `git describe --tags --abbrev=0`, and the moving pointer tag `latest` won over the version tag. The fallback now describes the version tags only (`--match 'v[0-9]*'`), so a pointer tag can neither become the version in the shell nor break the gate.
`WP-M1-21` is done — the promotion of `latest` moves into a job of its own, and the
promotions of one image are serialised by the concurrency group `latest-<image>`. Two
promotions of the same image therefore never interleave: without the group the older run
could read the registry before the newer version tag existed and write `latest` after the
newer run had already written it.
`WP-M1-20` is done — `AGENTS.md`, `PLAN.md` §18.3 and `CONTRIBUTING.md` name
`npm run release:push` instead of `git push --follow-tags` and carry the rule "one tag per
push" with the GitHub limitation behind it.

**ADR-0005** and **WP-M2-45** close the credential gap of the BMAcloud sync: the page at
`/admin/bma-sync` administered the schedule and the trigger but the bearer key could only come
from `BMA_API_KEY`, so a deployment that cannot edit `.env` saw `bma_not_configured` with no
way out. ADR-0003 stays in force for the read-only client and the permission guards; only its
credential rule is superseded. The key may now live in the `settings` row `bma.api.key` and
wins over the environment; `GET /admin/bma-sync/credentials` answers `{ configured, source }`
with `source` in `db`/`env`/`none`, `PUT` stores a trimmed 1–512 character key and `DELETE`
removes the row — the stored value is never answered, never logged and never written into a run
row. `readBmaApiKey(database, env)` is the single resolution point — of the manual trigger
(WP-M2-45) and, since **WP-M2-46**, of the pg-boss worker as well: one startup read decides
whether the queue is scheduled at all, and every run resolves the key again, so storing or
deleting it on the admin page needs no API restart. **WP-M2-47** added the write-only field on the page.
Both child WP files were created in the same commit as this parent.

**Phase 3 is complete.** Its work was implemented early under phase 2 — **WP-M2-09**
(Dexie outbox), **WP-M2-09a** (service worker and replay) and **WP-M2-09b** (offline E2E in
`de` and `en`). The closure filled `specs/09-offline.md`, which had been a placeholder, and
checked the shipped code against the exit criterion "offline report creates exactly one
ticket after reconnect". It found one defect: the Workbox background-sync route compared
`/v1/public/tickets` while the app requests `/api/v1/public/tickets`, so the queue never
matched. **WP-M3-01** fixes the predicate (`apps/web/src/lib/sw-routes.ts`), covers it with
a unit test and keeps the outbox, the online path and the API unchanged. The offline E2E
passes against a real throwaway database and a real Chromium.

**The host update in the field (WP-M3-02).** Every rebuild moves the fixed `:latest` tags
of `docker-compose.yml` to the new images, so the previous image of each built service
turns tagless. `scripts/update.sh` removed them only through `docker image prune -f` with
the `com.docker.compose.project` **image** label — a label a build from a remote build
context, the `docker-compose` v1 fallback and an aborted build never write, so every such
update left a `<none>` image on the host. The script now snapshots the image ids it owns
before the rebuild and removes by id whatever no container of the project and no current
tag needs, never prunes unscoped, rebuilds with `--remove-orphans` and clears an existing
backlog with `--cleanup` and `--gc`. **WP-M3-02b** closed the same gap in the update agent:
it snapshots the image ids of the three owned names before the rebuild, removes by id
whatever neither a current tag nor a container of the project needs, keeps the
project-labelled prune as its last best-effort command and never prunes a time window —
`--gc` stays a property of the script. That closes the last open item of phase 3.

**Record correction (WP-M3-02b commit).** The rows of **WP-M2-75 … WP-M2-78** still said
`planned` although `e61b5fe`, `afacc9a`, `16e29a8`/`07e6490` and `ad00476` had shipped the
`ticket.delete` key, the `ticket_purges` log (migration `0012`),
`DELETE /api/v1/tickets/:ticketNo` and the "Endgültig löschen" button; their `status:` lines
and both backlog tables now say `done` (`AGENTS.md`: the table is updated in the commit that
finishes an item).

**The start command under Arcane (WP-M3-03, corrected by WP-M3-04).** The same field
report stopped at the first line of the guide on `/admin/update`: the command `cd`ed into
the `com.docker.compose.project.working_dir` label of the running web container, and that
label holds the path **inside** the container that ran compose — under Arcane
`/app/data/projects/stoerdesk`, which the host does not know. **WP-M3-03** mapped the label
through the bind mounts of the running containers; **WP-M3-04** replaced that discovery with
the contract the field actually uses: the operator runs the copied command in the project
folder, the command pins it with `--project-directory "$PWD"`, keeps the project name from
the `com.docker.compose.project` label and appends only the missing `POSTGRES_PASSWORD` /
`SESSION_SECRET` to the project `.env`, read from the running `api` container with
`docker exec … printenv` under `umask 077` — the compose file needs that file, because `api`
declares `env_file: .env`. `docs/DEPLOYMENT.md` names the Arcane host path and the rule that
the label path is container-internal; `scripts/update.sh` still requires a real checkout,
and the self-cloning agent stays a separate decision. **WP-M3-04b** adds the guard: the
command exits with `exit 1` and a clear message if the current directory has no
`docker-compose.yml`, before Compose or the `.env` are touched. **WP-M3-05**
lays the ground for the step deadline: the shared update schema and the
administration labels know the fixed error code `update_step_timeout`.
**WP-M3-06** gives every step of the run a deadline (`UPDATE_STEP_TIMEOUT_MS`,
default ten minutes): `git pull`, the compose rebuild and the image clean-up.
A step that passes its deadline fails with `update_step_timeout`, the run
reaches `finishedAt` and `lastRun` leaves `running` — `Läuft` no longer sticks
for a build that never comes back. **Record.** WP-M3-05 was first committed unsplit
(b551259): its document carried 6 `files-write` entries over the §17 limit, so the
check runs v0.1.130 … v0.1.132 were red at `wp-check`. The split into WP-M3-05 and
WP-M3-06 replaced the document; its removal turns `wp-check` green again.

**Record correction (WP-M4-01 E2E repair).** The WP-M4-01 test never ran a green CI check
run: its CI jobs v0.1.123 … v0.1.125 failed at the first UI step. Two defects: the test
clicked the workflow buttons without opening the "Actions" toggle that WP-M2-19d put in
front of them, and the detail page posted the internal **event names**
(`/review_started`, `/accepted`, …) instead of the route segments defined by WP-M2-19c
(`/review`, `/accept`, …) — sending `content-type: application/json` without a body, which
Fastify answers with 400. The repair maps every event to its segment, sends the header only
with a body, opens the panel per step in the test and drops the two `waitForResponse` calls
that waited for a browser request the API-driven steps never make. The E2E now runs against
a real throwaway database and Chromium — locally 10/10 and in the CI check run.

**Phase 5 is split and started (the `m5` packages).** Phase 4 closed with WP-M4-01 and left
no open follow-up, so the next roadmap step is phase 5 (offline internal actions). It had nowork packages — `specs/09-offline.md` §9.6 only named the topic — so the split required by
`PLAN.md` §16 happened first: **WP-M5-01 … WP-M5-09** in `work-packages/m5/`, implemented in
numeric order (01 outbox table → 02 receipts table → 03 idempotent helper → 04 routes →
05 queue UI → 06 conflict UI → 07 offline reads → 08 E2E exit criterion → 09 cache clear on
sign-out). **WP-M5-01 is implemented** (Dexie v2 `internal_actions` queue, replay triggers,
`pendingWrites`). The exit criterion "offline acknowledge syncs and conflicts are shown" is
proven by WP-M5-08. Claiming from the pool and confirm/decline of shifts stay out of phase 5
(online-only rule of §9.6, on-call is phase 8).

## Validation

```bash
npm run wp:check
```

The check enforces the small-model limits for WPs with `format: small-model`:
max. 120 lines, max. 4 written source files, max. 6 read source files, context
budget max. 30k tokens, required metadata and sections. Legacy WPs are reported
and skipped until they are migrated.
