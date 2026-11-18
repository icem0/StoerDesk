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
| [m3](m3/) | Phase 3: offline sync closure and the update control (check + deploy webhook) | 15  |
| [m4](m4/) | Phase 4: ticket workflow online — E2E test for the complete workflow          | 1   |
| [m5](m5/) | Phase 5: offline internal actions — queue, receipts, replay, conflicts | 9  |
| [m7](m7/) | Phase 7: ntfy channel adapter, channel test, ntfy onboarding, outbox, drain worker, fallback chain, exit criterion, e-mail channel adapter, Telegram channel adapter, matrix and signal locale/deep link | 11 |
| [m8](m8/) | Phase 8: on-call calendar — pools, DST slots, planning, confirm/decline, swaps, ticket coupling, iCal, offline shift actions | 16 |
| [m9](m9/) | Phase 9: dashboard and statistics — test flag, SQL views, contracts, dashboard service/route/SSE/settings, TV display, statistics services/routes/CSV, web dashboard, statistics page, TV page, dashboard settings, exit criterion | 18 |
| [m10](m10/) | Phase 10: API and hardening — API keys, external object/ticket API, webhooks, OpenAPI, CSV import, privacy retention/export, backup/restore drill, exit criterion, dashboard evaluation averages, recent-usage fault catalog order, dashboard most-frequent fault | 24 |
| [m11](m11/) | Phase 11: detected errors — admin catalog (CRUD, archive), close with comment + detected errors, statistics `byDetectedError` | 10 |
| [m12](m12/) | Phase 12: acceptance — criteria slice mirrored from PLAN.md §20, end-to-end acceptance suite for items 1–12 | 2 |
| [m13](m13/) | Phase 13: escalation logic — workflow stages, waiting deadlines per priority, conditions, actions, stage selection in the ticket view, the localized administration page | 18 |
| [m14](m14/) | Phase 14: administration consolidation and messenger channels — the administration home disappears into the settings menu, the channels become configurable, the accounts are linked, the readiness allocation announces itself, the workflow and the escalation stages become a configurable chain (WP-M14-35 … WP-M14-44 — WP-M14-38 split into WP-M14-38a … WP-M14-38c — WP-M14-58 … WP-M14-67) and ntfy becomes an optional Compose profile (WP-M14-69 … WP-M14-72) — **closed** (WP-M14-73 … WP-M14-75) — out of band again for the office (WP-M14-76 … WP-M14-78) and the escalation offers and assigns tickets (WP-M14-79 … WP-M14-85 with the split children WP-M14-82b and WP-M14-85b), with the office reports on the ticket view and on the readiness calendar (WP-M14-86, WP-M14-87) | 96  |

Every `m0`, `m1`, `m2` and `m3` document carries `format: small-model` except the four first
foundation scope documents `WP-M1-01` … `WP-M1-04`; `npm run wp:check` reports those four
as legacy and skips them. A package that was rewritten from a legacy plan and split is
recognisable by its children: `WP-M1-07` → `WP-M1-07b`, `WP-M1-09` → `WP-M1-09b` …
`WP-M1-09e`, `WP-M1-10` → `WP-M1-10b` … `WP-M1-10e`, `WP-M2-02` → `WP-M2-02b`,
`WP-M2-04` → `WP-M2-04b`/`WP-M2-04c`, `WP-M2-05` → `WP-M2-05b`/`WP-M2-05c`, `WP-M2-06` →
`WP-M2-06b`, `WP-M2-07` → `WP-M2-07b` … `WP-M2-07d`, `WP-M2-19` → `WP-M2-19a` …
`WP-M2-19d`, `WP-M14-38` → `WP-M14-38a` … `WP-M14-38c`. `WP-M1-23` … `WP-M1-27` are **retroactive records**: they do not announce
work, they document phase 1 commits that landed without a work package, so that the
record is complete (`AGENTS.md`, _Open follow-ups (mandatory closure)_).
**WP-M1-28** hardens the CI chain itself: the pre-push tag guard, the publish-gated
promotion, the post-promote deploy job and the Docker smoke test that no longer skips.

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
>
> **Phase 7 started** with the `m7` packages: **WP-M7-01** is implemented (the ntfy
> channel adapter `sendNtfyNotification` in `apps/api/src/notifications/channels/ntfy.ts`,
> wired into `configuredChannels` and its `.env.example` keys `NTFY_URL`/`NTFY_TOPIC`) and
> **WP-M7-02** (`02-ntfy-channel-test.md`) is implemented as its vitest suite — mocked
> `fetch` posts the JSON payload (title, message and the single `view` action labelled
> `Öffnen`) to `${NTFY_URL}/${NTFY_TOPIC}` with `content-type: application/json`, the channel
> still sends when `pwaUrl` is empty, and a non-2xx answer throws `NtfyError` `http_error`.
> **WP-M7-03** (`03-ntfy-qr-code.md`) is implemented: `apps/web/src/features/settings/NtfySubscription.tsx`
> renders a `qrcode.react` card whose QR carries the subscription address
> `${NTFY_PUBLIC_URL}/${NTFY_TOPIC}` of `docs/DEPLOYMENT.md` — the values arrive as props or from the
> build-time `VITE_NTFY_PUBLIC_URL` / `VITE_NTFY_TOPIC` pair, and a `deepLink` switch renders the
> `ntfy://<topic>` payload of the app instead. The labels `ntfy.subscribe`, `ntfy.qrLabel` and
> `ntfy.appHint` are added to the `common` namespace in `de` and `en`, and the card renders nothing
> while the channel is not configured. **WP-M7-04** (`04-notification-outbox.md`) is implemented:
> `0019_notification_outbox` adds the `notification_channels`, `push_subscriptions` and `outbox`
> tables (the `state` check `PENDING`/`SENT`/`FAILED`, `attempts` default `0`, the
> `outbox(state, created_at)` index, `notification_channels` and `push_subscriptions` are rows only,
> no routes yet), `notifications/outbox.ts` exposes `enqueueOutbox(database, ticket, env)` that inserts
> one `PENDING` row per channel of `configuredChannels(env)` (never an HTTP call), and `report.ts`
> calls it inside the create transaction after the ticket and its `created` event so a channel failure
> can never lose the event; the row carries only the machine-readable message parameters
> `{ ticketNo, priority, objectName }` (no photo, no contact data). Its announced follow-up was
> split before any code was written (`PLAN.md` §17: the worker needs `outbox.ts` next to the
> direct-start wiring in `index.ts`, which exceeds the four-file budget together with the label
> files): **WP-M7-04b** (`04b-outbox-worker-and-label.md`) is implemented as the **localized
> ntfy `view` action label** — `server.{de,en}.json` gained `notification.action_label`
> (`Öffnen` / `Open`) and `NtfyConfig` the optional `locale` of the shared `ServerLocale`, so
> the payload label is `t(locale, 'notification.action_label')` and the hard-coded German
> literal of WP-M7-01 is gone. **WP-M7-04c** (`04c-outbox-drain-worker.md`) is **implemented**:
> `apps/api/src/notifications/outbox.ts` claims the oldest `PENDING` row atomically with one
> `UPDATE ... WHERE state = 'PENDING'` plus the `(state, created_at)` index of migration 0019,
> sends through `configuredChannels(env)`, retries up to three attempts with backoff, writes
> `SENT`/`FAILED` plus one `notification_sent`/`notification_failed` event per row, and
> `startNotificationOutboxJob` follows the `jobs/bma-sync.ts` shape (one short-lived pool per
> job, `createQueue`/`work`/`schedule` every minute) and is started only from the direct API
> start next to the other pg-boss jobs. **WP-M7-05** (`05-channel-fallback-chain.md`) is
> implemented as the second half of the phase 7 exit criterion: an exhausted row escalates
> to the next channel of the chain in `configuredChannels` order (`escalationChain`), a
> `PENDING` fallback row with the same ticket and the same machine-readable target params
> is queued in the same transaction as the `notification_failed` event — only when the
> ticket has no pending row for that channel already — and the drain claims it in the same
> run; `OutboxDrainResult` gained `fallback` with the log code `channel_fallback`.
**WP-M7-06** (`06-phase-7-exit-criterion.md`) is **implemented** as the phase-7 exit
criterion: `apps/api/src/notifications/__tests__/notification-exit.integration.spec.ts`
runs the real API on a throwaway database — the only `PENDING` outbox row of a
ticket sits on the failing signal channel, `drainOutbox` ends it `FAILED` after
three attempts, queues the `PENDING` fallback row of the next channel of
`escalationChain` in the same transaction and claims it in the same run, where a
local Matrix mock answers and the row ends `SENT` — and the `GET /api/v1/tickets/:ticketNo`
answer carries exactly one `notification_failed` (`attempts: 3`) and one
`notification_sent` event next to the `created` event; a second drain over the terminal
rows writes no event and no row and the last channel of the chain ends `FAILED`
without a fallback. Phase 7 is closed, no product code changed.

**WP-M7-07** (`07-smtp-channel-adapter.md`) is **implemented** as the e-mail channel the
phase-7 content line of `PLAN.md` §16 and `PLAN.md` §12 name: `apps/api/src/notifications/channels/email.ts`
sends the notification over SMTP with `nodemailer` (ADR-0009 — the plan fixes no SMTP
library and the `SMTP_PORT=587` default needs a STARTTLS upgrade Node cannot do), keeps
the adapter shape of WP-M7-01 (`EmailConfig` from the existing `SMTP_*` keys, `EmailError`
with `no_sender`/`send_failed`, the transport factory as injectable last parameter) and
the message content of WP-M7-04 (subject `message.title`, body plus a `\n\n<label>:
<pwaUrl>` deep link labelled `t(locale, 'notification.action_label')`, no photo, no
contact data). `configuredChannels(env)` gained the `email` entry — configured only when
`SMTP_HOST` and `SMTP_FROM` are set — appended last, so the escalation chain of WP-M7-05
is signal → matrix → ntfy → email; the worker, `escalationChain` and migration `0019`
needed no change.

**WP-M7-08** (`08-telegram-channel-adapter.md`) is **implemented** as the Telegram channel:
`apps/api/src/notifications/channels/telegram.ts` posts the notification as JSON (`chat_id`,
`text`) to `sendMessage` of the Telegram Bot API with plain `fetch` — no library, no ADR, the
transport of ntfy and Matrix — keeping the adapter shape of WP-M7-07 (`TelegramConfig` from the
existing `TELEGRAM_*` keys, `TelegramError` with `no_token`/`http_error`, `fetch` as its
injectable last parameter) and the message content of WP-M7-04 (`${title}\n${body}` plus a
`\n\n<label>: <pwaUrl>` deep link labelled `t(locale, 'notification.action_label')`, no photo,
no contact data). `configuredChannels(env)` gained the `telegram` entry — configured only when
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are both set — appended last, so the escalation
chain of WP-M7-05 is now signal → matrix → ntfy → email → telegram; the worker, `escalationChain`
and migration `0019` needed no change. Telegram account linking via a one-time code (§12) stays
a later WP; Web Push (VAPID) is WP-M7-09.

**WP-M7-09** (`09-web-push-channel-adapter.md`) is **implemented** as the sixth notification
channel: `apps/api/src/notifications/channels/web-push.ts` delivers `${title}\n${body}` plus the
deep link labelled `notification.action_label` through the `web-push` library
(ADR-0010 — encrypted payloads and VAPID JWT signing are not hand-written locally);
`WebPushConfig` reads `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — configured
only when all three are set — `sendWebPushNotification` throws `WebPushError('no_keys')`
without keys and wraps transport failures as `send_failed`, never leaking the endpoint,
the keys or the private key; an empty subscription list is a successful no-op. The chain entry
in `channels/index.ts` reads the `push_subscriptions` rows of WP-M2-95 (endpoint, p256dh,
auth) over a short-lived database pool, so the escalation chain of WP-M7-05 is now
signal → matrix → ntfy → email → telegram → webpush. The PWA push registration (subscribe
in the web app, `notification_permissions` and the admin failure warning of §12), per-event
channel selection and `pushUrl` as an escalation parameter stay unimplemented.

**Phase 11 is complete and phase 12 acceptance starts.** Every phase-11 follow-up
is closed — `WP-M11-02` … `WP-M11-10` plus `WP-M11-11` and `WP-M11-12` are done and
no `Follow-up WP:` or `Open question:` line stays open in `work-packages/m11/`.
**WP-M12-01** mirrors the acceptance summary of `PLAN.md` §20 (items 1–12) into
`specs/16-acceptance.md` — the original book chapters 18 + 19 were not supplied —
maps every item to the implemented surfaces and announces the split **WP-M12-02**,
the acceptance end-to-end suite for items 1–12
(`scripts/e2e-acceptance.mjs`).
The phase-5 offline E2E `apps/web/e2e/offline-internal.spec.ts` was repaired out of band
after WP-M12-06 and WP-M12-08 removed both dropdowns: the two acknowledge tests still
opened the options dropdown and waited for a button that no longer exists, so they now
click the acknowledge button of the escalation section directly (14/14 Playwright tests
green against the real database and Chromium). The same spec was made deterministic again
after a CI run lost the reload race of the conflict banner: `onActionChange` in
`apps/web/src/lib/outbox.ts` announces every write to an `internal_actions` row,
`useInternalActions` re-reads the rows of its ticket and the conflict is asserted on the
open page before the reload (WP-M5-06 conflict UI).

**WP-M12-02 is done and phase 12 is closed.** `scripts/e2e-acceptance.mjs` drives the
twelve items of `specs/16-acceptance.md` §16.1 in one ordered run against a throwaway
database and the running API/web pair; the run prints `acceptance: 11/12 verified` —
items 1–10 and 12 `PASS`, item 11 `UNVERIFIED` by design (the web app has no
push-subscription registration, so only the delivery side is proven). The run found one
real product defect: the workflow transition never wrote `acknowledged_at`, so the
timeline of an acknowledged ticket never stopped (§16.1/5). `transitionTicket` now writes
the workflow columns of `PLAN.md` §7 for its milestones, and the new integration test
`apps/api/src/tickets/__tests__/workflow-columns.integration.spec.ts` proves it. The
runner itself was repaired where it still addressed the pre-WP-M13-09 UI (disabled
acknowledge confirm) and now turns one unexpected error into that item's `FAIL` instead
of aborting the remaining verdicts.

**WP-M12-09** moves the e-mail export and the cancel button of the ticket detail view
into the header: the export is an icon button (envelope, 44 px target, `aria-label` from
`detail.menu.email`) next to the cancel button, both sit at the top right next to the
status and priority badges and leave the escalation section, which keeps the workflow
actions and the permanent delete. The way back to the list is deleted for good: the
`list` entry of the action list, its handler branch and the `detail.back` /
`detail.menu.back` labels of `de` and `en` are gone.

**WP-M13-01 … WP-M13-17** implement the escalation logic of ADR-0017: the five
workflow milestones become the escalation stages, a stage is a milestone to be
reached and its deadline is the waiting time per priority, the rules, the
conditions and the actions live in the database and are maintained in
`/admin/escalation`, the ticket view selects a stage instead of pressing one
button per workflow step, and the former manual stage catalogue (`office`,
`group`, `assignee`, `manager`), the `escalation_set` event and
`POST /api/v1/tickets/:ticketNo/escalate` are removed. **WP-M13-18** localizes that
page: stage names follow the language of the interface and the closed vocabularies
(the reference events, the condition fields and operators, the action types and the
channels) show their i18n label instead of the raw key, with the broken German texts
repaired.

**Phase 14 has started.** **WP-M14-01** removes the standalone administration
home at `/admin`: every administration module is a link of the settings menu at
`/settings`, the retired address redirects there and the texts of the removed
page are gone in `de` and `en`. **WP-M14-02** turns the back links of the
administration and settings pages to the settings menu. **WP-M14-03** is the
working plan of the messenger channels of the phase — ntfy, Telegram, Matrix and
WhatsApp Web: `specs/10-notifications.md` carries the reviewed contract,
ADR-0019 decides that the configuration of the channels and the accounts of the
users live in the database (the environment stays the fallback) and ADR-0020
decides that WhatsApp Web is an external bridge of the operator — StörDesk
ships no browser and no WhatsApp session. The phase is split into
**WP-M14-04 … WP-M14-21** and is implemented in numeric order.
**WP-M14-04** is implemented: migration `0033_notification_channel_config.sql`
gives `notification_channels` the columns `kind` (unique), `enabled`, `label`,
`config` (jsonb) and the write-only `secret` and creates `notification_accounts`
and `notification_preferences` (§11.3, §11.4); the new service
`apps/api/src/notifications/config.ts` answers the effective configuration per
kind with `readChannelConfiguration(database, env)` — a row wins over the
environment, a kind without a row keeps its environment values, a disabled
channel is not configured — with `secretSet` instead of the secret (ADR-0005).

**Phase 14, out of band (WP-M14-22, requested by the office):** the e-mail view
and the pdf view of a ticket become one prepared send view. The ticket detail
header replaces the envelope icon with a paper plane ("Versenden" / "Send") that
opens `/tickets/:ticketNo/send` — `apps/web/src/features/tickets/ticket-send-page.tsx`
prepares the branded ticket and offers the two buttons "Als PDF speichern"
(`window.print()` with the A4 print CSS) and "E-Mail versenden" (prefilled
`mailto:` with subject, body and the deep link to the ticket detail) on top.
All history events show in full (date, label, actor and event text), every
block — each event row, each photo, each field section — avoids page-break
cuts (`print:break-inside-avoid`) and the photos are eager so they appear in
the printout; `ticket-email-page.tsx`, `ticket-pdf-page.tsx` and the routes
`/tickets/:ticketNo/email` and `/tickets/:ticketNo/pdf` are gone.

**Phase 14, out of band (WP-M14-34, requested by the office):** a `mailto:`
body is plain text only — no e-mail program ever receives HTML through it. So
the "E-Mail versenden" button of the prepared send view is removed (the
server-side e-mail send returns as a later WP) and replaced by "Kopieren
(HTML)": `copyPreparedHtml` selects `[data-testid="ticket-send-content"]` and
copies the prepared ticket to the clipboard with the browser's HTML flavour
(`execCommand('copy')` first, `ClipboardItem` as the fallback) so the user
pastes the formatted ticket into their e-mail program; the hint line names
the paste step and the `email.*` texts leave `de` and `en`.

**Phase 14, out of band (WP-M14-26 … WP-M14-32, requested by the office):** the
readiness allocation announces itself. The office complained that an assigned
readiness cannot be accepted and that the allocation never reaches the
technician. **WP-M14-26** is the spec and decision package: `specs/04-oncall.md`
§4a.3, §4a.4 and §4a.9 plus `specs/10-notifications.md` §11.4, §11.5, §11.7,
§11.10, §11.12 and §11.14 carry the rules, ADR-0021 decides that `oncall.assigned`,
`oncall.swap_requested` and `oncall.unconfirmed_reminder` are notification events,
that the technician selects their channels for them in
`/settings/notifications`, that the outbox gains `event_type` and a nullable
`shift_id` and that a `DRAFT` readiness is confirmable. The children are
implemented in numeric order: **WP-M14-27** (migration `0039`), **WP-M14-28**
(the readiness message, the shift enqueue, the shift branch of the drain),
**WP-M14-29** (the allocation and a swap request enqueue their rows),
**WP-M14-30** (a `DRAFT` readiness answers a confirm), **WP-M14-31** (one
reminder per unconfirmed shift from the escalation scan) and **WP-M14-32**
(the readiness selection on the settings page). No product code in the spec
package.

**WP-M14-29** is implemented: `createShift` and the assign branch of `updateShift`
in `apps/api/src/oncall/service.ts` enqueue `oncall.assigned` for the technician
in the transaction node the shift write already uses, and `requestSwap` in
`apps/api/src/oncall/swaps.ts` enqueues `oncall.swap_requested` for the
requesting technician and for a named target colleague — a request to the whole
pool notifies only the requester. The rows are written through
`enqueueOncallOutbox` of WP-M14-28, never in a channel call (§11.7);
`assignedAnnouncementQueued` keeps the allocation announcement idempotent: a
shift whose `oncall.assigned` row is still `PENDING` or already `SENT` queues no
second row. `apps/api/src/oncall/__tests__/allocation-notifications.integration.spec.ts`
drives the real routes on a throwaway database and asserts the selected channel
of a technician who selected one and the instance chain for one who did not.

**WP-M14-30** is implemented: `CONFIRMABLE_STATES` in `apps/api/src/oncall/confirm.ts`
holds `DRAFT` and `PLANNED`, so the assigned technician — or an admin — accepts their
assigned readiness; the acceptance sets `state = CONFIRMED` and `confirmed_at` and
writes the single append-only `confirmed` `oncall_events` row in the same transaction,
while the decline rule (`PLANNED`/`CONFIRMED` only), the `oncall_shift_started` rule and
the `clientUuid` idempotency stay. `apps/web/src/features/oncall/my-shifts-page.tsx`
renders the confirm button for a `DRAFT` shift of the own technician next to `PLANNED`
— a `DRAFT` shift of another technician still shows no action and decline and swap keep
their states. `apps/api/src/oncall/__tests__/confirm.integration.spec.ts` proves the
`200` of a `DRAFT` confirm, the idempotent repeat and the `409 oncall_invalid_shift_state`
of a `DECLINED` and an `UNFILLED` shift.

**WP-M14-31** is implemented: `enqueueOncallReminders(database, env, now)` in
`apps/api/src/oncall/coupling.ts` selects every `DRAFT` or `PLANNED` shift with a
technician that has not started and starts within `oncall.reminder_unconfirmed_h`
and queues one `oncall.unconfirmed_reminder` row per shift through
`enqueueOncallOutbox` of WP-M14-28 in its own transaction — a shift that already
has such a row (`PENDING` or `SENT`) is skipped, so one reminder per shift.
`apps/api/src/jobs/escalation.ts` runs that sweep after the offer timeout inside
the existing per-minute `ticket-escalation` job and logs only the
`remindersQueued` counter, never a shift id (ADR-0021, `specs/10-notifications.md`
§11.7). `apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts`
proves the window, the idempotent second scan, the `CONFIRMED` shift, the
out-of-window shift and the slot without a technician writing nothing and the
counter of the scan result.

**WP-M14-32** is implemented: the readiness block of `/settings/notifications`
(`apps/web/src/settings/notifications-page.tsx`) renders the three readiness event
types of §11.4 as their own rows below the ticket-event selection section of
WP-M14-17 — one row per readiness event type with one checkbox per configured
channel (a channel that is not configured is not offered), a user without a saved
row for a readiness event type sees the row with "the channels of the instance"
(the fallback of §11.4); toggling a readiness checkbox feeds the same shared
selection state, saved through `PUT /api/v1/notifications/preferences` of WP-M14-16
(no API, schema or migration change). The block carries the settings namespace
keys `settings.notifications.events.oncall.assigned` = "Bereitschaft allocation"
/ "Readiness allocation", `oncall.swap_requested` = "Swap request" / "Swap
requested" and `oncall.unconfirmed_reminder` = "Unconfirmed reminder" / "Unconfirmed
shift reminder" in de and en; `apps/web/src/settings/__tests__/readiness-selection.test.tsx`
proves the three rows with the German labels, the checkbox state for a saved
readiness row, the "channels of the instance" fallback, the missing checkboxes
of an unconfigured channel and the shared PUT body shape.

**Phase 14 (WP-M14-35, WP-M14-36): the ticket statuses become configuration.**
**WP-M14-35** is implemented: migration `0034_ticket_statuses.sql` gives `ticket_statuses`
the columns `key`, `names` (jsonb `de`/`en`), `color`, `position`, `active` and `is_terminal`
and `apps/api/src/db/seed/statuses.ts` seeds the nine statuses of `PLAN.md` §7 idempotently
on the direct API start. Its fixed-key CHECK contradicted its own goal — no new status could
ever be created — so a `fix(api)` commit added migration `0040_ticket_status_key_format.sql`:
the CHECK becomes a key-format CHECK (`^[A-Z][A-Z0-9_]{0,39}$`, the form ADR-0023 uses for
stage keys) and `apps/api/src/db/schema.ts` follows. **WP-M14-36** is implemented as the
status administration API: `apps/api/src/tickets/status-service.ts` reads, creates, edits and
deletes rows — the answer carries `ticketCount`, the key of an existing status is immutable
(the open question of WP-M14-36 resolved: a renamed key would break the workflow, the stages
and the tickets that reference it) — and `status-routes.ts` answers `GET`/`POST`/`PATCH`/`DELETE`
`/api/v1/admin/statuses` behind `settings.read`/`settings.write`: a malformed body is
`400 invalid_request` with the field paths, a taken key `409 status_key_taken`, an unknown key
`404 status_not_found`, a status a ticket still carries `409 status_in_use` with its number and
the last active status is never switched off or deleted (`409 status_last_active`). The shared
contracts `ticketStatusCreateRequestSchema`, `ticketStatusUpdateRequestSchema`,
`ticketStatusResponseSchema` and `ticketStatusListResponseSchema` of `packages/shared/src/schemas/ticket.ts`
bind request and answer. `apps/api/src/tickets/__tests__/status-management.integration.spec.ts`
proves the rules on a throwaway database. **WP-M14-37** is implemented as the status
administration UI: `apps/web/src/admin/status-page.tsx` (`StatusPage`) renders the
`ticket_statuses` table — key, the names de/en, the colour, the position, the active and
terminal flags and the `ticketCount` — behind `settings.read` at `/admin/statuses`,
`settings.write` offers the create form and the per-row edit/delete buttons;
`apps/web/src/admin/status-form.tsx` (`StatusForm`) validates create and edit bodies
client-side against the shared schemas and the key of an existing status stays immutable.
A delete goes through a confirmation dialog and answers `409 status_in_use` / `409 status_last_active`
by name. WP-M14-38 … WP-M14-41, WP-M14-54 and WP-M14-70 … WP-M14-72 stay open in numeric order.

**Phase 14, out of band (WP-M14-33, requested by the office):** the ntfy deep
link carries the host. The office wants the subscription QR of the own
channels page to land in the ntfy app and subscribe automatically. The ntfy
docs state that the app opens and subscribes a topic with the host-carrying
deep link `ntfy://<host>/<topic>` (a `https://<host>/<topic>/subscribe` is not
possible on Android) and that an insecure server takes `?secure=false` — the
payload `ntfy://<topic>` of WP-M7-03 and WP-M14-13 lacked the host. **WP-M14-33**
is implemented: the deep-link branch of `subscriptionValue` in
`apps/web/src/features/settings/NtfySubscription.tsx` and the `deepLink` of
`GET /api/v1/notifications/accounts/ntfy` in `apps/api/src/notifications/routes.ts`
now build the documented host-carrying form. No credential, token or user id
enters the QR or the deep link — ntfy offers no URL-login scheme and ADR-0005
keeps every secret write-only, so a protected topic is unlocked by a login in
the ntfy app itself.

**The ntfy access token reaches every send (WP-M14-51, out of band in phase 14,
requested by the office; WP-M14-52 and WP-M14-53).** The office runs
its own ntfy server that requires an access token. The test send answered
`403 Veröffentlichung verweigert` and blamed a claimed topic — the key had been
saved in the write-only `secret` of the `ntfy` row (and in `NTFY_TOKEN`) since
WP-M14-04, but `readChannelConfiguration` never carried it, so it reached
neither the test send of WP-M14-05, nor the verification code of WP-M14-47,
nor the outbox drain. **WP-M14-51** is implemented: ADR-0022 decides that the
access token of the ntfy server **is** the secret of the channel (§11.2 needs
no new column, no new environment key and no new route); `ChannelConfiguration.token`
carries it to the send — schema-stripped, never answered, never logged — and
`effectiveNtfyConfig`, the admin test registry and `effectiveEnv` of the drain
put it into the `Authorization` header of the adapter of WP-M7-01. The two ntfy
settings commits that landed before it without a WP id — `6ec9444` (the
copy-to-clipboard curl, the clickable subscription link and the `NTFY_TOKEN`
key) and `eb3f6d7` (the separate ntfy test topic removed from the card) — are
recorded here as part of this record. **WP-M14-52**
(`52-ntfy-401-and-403-name-the-access-token.md`) and **WP-M14-53**
(`53-the-ntfy-request-carries-a-timeout.md`) are implemented in numeric order: the
administration explains a `401`/`403` as a missing or wrong access token
instead of a claimed topic, and the publish request gains a timeout so an
unreachable server answers `http_timeout`.

**The own channels page names the channel administration (WP-M14-54 announced,
out of band in phase 14, requested by the office).** The office read the two
notification surfaces as one block and asked for the way back: `Settings →
Benachrichtigungen` and `Administration → Channels` repeat the channel list, the
ntfy subscription QR and the word "ntfy" — that split is specced and deliberate
(`specs/10-notifications.md` §11.12 names both pages, PLAN.md §17 keeps the
secrets, the test send and the minimum channels behind `notification.write` and
§11.4 needs the configured kinds to offer the selection checkboxes). What was
missing is the cross-link: WP-M14-48 links from the administration to the own
page, the own page only offers a back link to `/settings`. **WP-M14-54** adds the
missing link line on `/settings/notifications`; the two pages are not merged.

**The channel test send and the verification request carry a JSON body (WP-M14-55,
out of band in phase 14, requested by the office; done).** The office reported
`admin.channels.errors.FST_ERR_CTP_EMPTY_JSON_BODY` on the ntfy card: neither the
test message nor the one-time code reached the API, so the target stayed
*unverified* and produced no outbox row. Removing the separate ntfy test topic
(`eb3f6d7`) also removed the request body, while the page still sent
`content-type: application/json` — Fastify 5 rejects an empty body with that
content type before the route runs, so the optional-body contract of §11.11 was
never reached. **WP-M14-55** sends `body: JSON.stringify({})` on both requests;
the routes, their schemas and the saved row as test target (WP-M14-51) stay.

**The escalation stage chain becomes configurable (WP-M14-58, out of band in
phase 14, requested by the office; drafted, not implemented).** The office needs
a configurable number of escalation stages: an intermediate step is added when a
dispatch needs one, an inapplicable step is removed, and every stage names its
predecessor — or none. Today `PUT /api/v1/escalation/stages` only renames,
reorders and deactivates the five fixed keys and ADR-0017 forbids any other
stage (`escalation_stages_key_check`, `z.enum(ESCALATION_STAGE_KEYS)`).
**WP-M14-58** is the spec extension (`specs/07-escalation.md` §7.11), ADR-0023
(supersedes decision 1 of ADR-0017) and the split of **WP-M14-59 … WP-M14-67**:
database (`0037_escalation_stage_chain`, the `predecessor` and `reached_by`
columns, the cascade key) → shared contracts and the chain validator → seed →
replace-all stage-set API → engine on the chain → available stages of the ticket
view → administration UI and texts → page tests → exit criterion. WP-M14-35 and
WP-M14-38 (configurable statuses and transitions) are the prerequisites for
stages that reach new workflow events; they stay in numeric order before this
chain.

**Every notification message links to its ticket (WP-M14-68, out of band in
phase 14, requested by the office; done).** §11.5 already demanded "the deep
link into the ticket", but every adapter linked `env.PWA_URL` — the root of the
PWA — so a recipient in Telegram or ntfy had to find the ticket again by hand.
**WP-M14-68** adds the `deepLink` option of `NotificationChannel.send` in
`apps/api/src/notifications/channels/index.ts` (the registry passes it to every
adapter, the PWA root stays the fallback) and `ticketDeepLink(pwaUrl, ticketNo)`
in `apps/api/src/notifications/outbox.ts`, which `drainOutbox` hands to the send
as `<pwa-url>/tickets/<ticket-number>` — the same link on a fallback row of the
escalation chain. The link carries the ticket number only, never a `status_token`,
a credential or contact data; the readiness link to `/oncall` (ADR-0021) stays
with WP-M14-28.

**ntfy as an optional Compose profile (WP-M14-69, out of band in phase 14,
requested by the office; done).** ADR-0024 decision 1 makes the self-hosted
ntfy server a Compose profile next to `backup`. **WP-M14-69** adds the service
`ntfy` to `docker-compose.yml` with `profiles: [ntfy]`, the image pinned by
`${NTFY_IMAGE:-binwiederhier/ntfy}`, the command `serve`, `restart:
unless-stopped`, the json-file logging of the other services, the `backend`
network and **no `ports:` entry** — without the profile nothing starts and the
external ntfy path keeps working. `ntfy/server.yml` (mounted read-only at
`/etc/ntfy/server.yml`) carries `auth-file` and `auth-default-access: deny-all`,
`behind-proxy: true` with `proxy-forwarded-header: CF-Connecting-IP`, the cache
file and `base-url: ${NTFY_BASE_URL}` substituted by ntfy from the container
environment; the named volume `ntfydata` holds `/var/lib/ntfy`. `.env.example`
gains `NTFY_IMAGE`, `NTFY_BASE_URL` and `NTFY_HOSTNAME` next to the empty
`NTFY_TOKEN`, which the setup script of WP-M14-70 fills. No secret is in a file
of the repository; `docker compose config` with and without `--profile ntfy` is
unverified in this container (no Docker daemon) and CI runs the smoke test.

**WP-M14-38 is split before any code (WP-M14-38, the follow-up of WP-M14-37).** The
statuses became rows in WP-M14-35 … WP-M14-37, but the steps between them stayed the
code map `TRANSITIONS` in `apps/api/src/tickets/workflow.ts` — a status an
administrator adds has no step into it and none out of it, and the CHECK
`tickets_status_check` of migration `0004` still limits `tickets.status` to the nine
keys. The announced package needed five source files, over the four of `PLAN.md` §17,
so it is split: **WP-M14-38a** writes the table (`0041_ticket_transitions.sql`: both
statuses as foreign keys to `ticket_statuses.key` with `ON DELETE cascade`, `event_key`
unique per `from_status`, the nullable `condition_json`, the 22 seeded steps of `PLAN.md`
§7 plus the nine status rows the keys need, `tickets_status_check` dropped, the Drizzle
mirror, the journal), **WP-M14-38b** adds the shared contract and
`readTicketTransitions`/`resolveTransition`, **WP-M14-38c** makes `transitionTicket()`
read the table (`409 invalid_transition` for an unknown or inactive step, the workflow
columns still keyed by `event_key`). ADR-0025 decides the shape; `specs/07-escalation.md`
gains §7.13. No product code in this commit.

**WP-M14-38a is implemented (out of band in phase 14, the first child of WP-M14-38).**
Migration `0041_ticket_transitions.sql` creates `ticket_transitions` — `id` (UUID v7),
`from_status` and `to_status` as foreign keys to `ticket_statuses.key` with `ON DELETE
cascade`, `event_key` with the unique index
`ticket_transitions_from_status_event_key_key` over `(from_status, event_key)`, an index
over `to_status`, the nullable `condition_json` (stored, evaluated only from WP-M14-41)
and `active` — and seeds it idempotently: the nine default statuses (the values of
`apps/api/src/db/seed/statuses.ts`) and the 22 steps of `PLAN.md` §7 (`ON CONFLICT …
DO NOTHING`). `tickets_status_check` of migration `0004` is dropped (ADR-0025 decision
5), the schema mirror `ticketTransitions` follows and the journal reaches `0041`.
`apps/api/src/db/__tests__/ticketTables.integration.spec.ts` no longer expects the
status CHECK — a `DONE`-style key stays on the ticket as history, the priority and
source checks stay enforced. WP-M14-38b and WP-M14-38c stay open in numeric order.

**WP-M14-38b is implemented (out of band in phase 14, the second child of WP-M14-38).**
`packages/shared/src/schemas/ticket.ts` gains the row contract of §7.13 —
`TicketTransition { id, fromStatus, toStatus, eventKey, condition, active }` behind
`ticketTransitionSchema`, both statuses bound to the key format of
`ticketStatusKeySchema` (they are foreign keys to `ticket_statuses.key`), the event
key bound to `ticketTransitionEventKeySchema` (`^[a-z][a-z0-9_]{0,39}$`, the form of
the events of `PLAN.md` §7) and `ticketTransitionNotFoundCode = 'transition_not_found'`.
`apps/api/src/tickets/transition-service.ts` reads the rows of `ticket_transitions` —
active and inactive — ordered by `from_status` and `event_key` through that schema
(`readTicketTransitions(database)`) and resolves a step purely
(`resolveTransition(transitions, fromStatus, eventKey)`): the row that performs the
step, or `undefined` when no **active** row does — an inactive row resolves like a
missing one and the caller decides the error. The rows are loaded once per call, so
`transitionTicket()` of WP-M14-38c resolves them there. No create, update or delete
function (WP-M14-39), no evaluation of `condition` (WP-M14-41), and `transitionTicket()`
still reads the code map `TRANSITIONS` until that child. The new
`apps/api/src/tickets/__tests__/transition-service.integration.spec.ts` (a test, outside
the file count) proves on a migrated throwaway database that the 22 seeded rows come back
in that order, that one `cancelled` row exists per status, that `NEW`/`review_started`
resolves to `IN_REVIEW`, that `NEW`/`closed` resolves nothing and that a row set to
`active = false` resolves nothing while the rows still count 22. WP-M14-38c stays open in
numeric order.

**WP-M14-38c is implemented (out of band in phase 14, the third child of WP-M14-38).**
`transitionTicket()` in `apps/api/src/tickets/workflow.ts` loads the rows once per call with
`readTicketTransitions(database)` and resolves the step of `(current status, event)` with
`resolveTransition(transitions, fromStatus, event)`; `undefined` throws the existing
`INVALID_TRANSITION` (409 `invalid_transition` with `from` and `event` in `params`), the UPDATE
inside the transaction still re-checks `status = <from>` (the atomic acceptance rule of `PLAN.md`
§12), the workflow columns (`reviewStartedAt`, `workOrderText`, `acceptedAt`,
`acknowledgedAt`, `closedAt`) stay keyed by `event_key` and the new status comes from the
`toStatus` of the row — the map lookup and its wildcard `TRANSITIONS['*']` are gone, because the
migration seeds one `cancelled` row per status. `TRANSITIONS` and `TRANSITION_EVENT_KEYS` stay
exported only as the view of the escalation layer, which WP-M14-40 and WP-M14-41 move onto the
table. The new `apps/api/src/tickets/__tests__/transition-table.integration.spec.ts` (a test,
outside the file count) proves on a migrated throwaway database that a `NEW` ticket reaches the
status the seeded row names (`IN_REVIEW` through `review_started`), that an event without a row
answers 409 `invalid_transition` and leaves the ticket untouched, that a row the test sets to
`active = false` blocks its step and that a row whose `to_status` was edited moves the ticket to
the status the row names. The existing workflow, pause, internal-action and E2E workflow specs stay
green on the seeded rows. WP-M14-39 and WP-M14-39b stay open in numeric order.
**WP-M14-39 is implemented (out of band in phase 14, the follow-up of WP-M14-38c):**
`apps/api/src/tickets/transition-service.ts` gains `createTicketTransition`,
`updateTicketTransition` and `deleteTicketTransition` next to the read of WP-M14-38b,
`apps/api/src/tickets/transition-routes.ts` answers `GET`/`POST`/`PATCH`/`DELETE`
`/api/v1/admin/transitions` behind `settings.read`/`settings.write` and `apps/api/src/index.ts`
registers them: a malformed body is `400 invalid_request` with the field paths (both status
keys bound to the key format of `ticketStatusKeySchema`, the event key to
`^[a-z][a-z0-9_]{0,39}$`), a status key that names no row of `ticket_statuses` is `400
invalid_status_key` (the foreign keys of migration `0041` are the database backstop), a
`POST`/`PATCH` that would duplicate the unique index `(from_status, event_key)` of that
migration answers `409 transition_duplicate` with the pair and an unknown `id` is `404
transition_not_found`; the `id` of an existing row is never edited, no row is guarded by
a step count (ADR-0025 keeps the trade-off visible). The new
`apps/api/src/tickets/__tests__/transition-management.integration.spec.ts` proves the four
routes, both format rejections, the create of a new step, the `invalid_status_key` of an
unknown key, the `transition_duplicate` on `POST` and `PATCH`, the edit of the `active`
switch and the delete of the added row. WP-M14-39b stays open in numeric order.
**WP-M14-39b is implemented** (the UI of the transition administration): `apps/web/src/admin/transition-page.tsx`
(`TransitionPage`, route `/admin/transitions` behind `RequireSession`) renders the `ticket_transitions`
table of WP-M14-38a — row identity, `from_status` → `to_status`, the `event_key` and the `active`
switch — behind `settings.read`; `settings.write` adds the per-row edit and delete buttons and the
create form of `TransitionForm`, which validates both status keys against `ticketStatusKeySchema`
and the event key against `ticketTransitionEventKeySchema` before the request of WP-M14-39 is sent.
A delete confirms in a dialog and names its code (`404 transition_not_found`), a duplicated
`(from_status, event_key)` pair answers `409 transition_duplicate` and a status key that names no
status `400 invalid_status_key`; ADR-0025 keeps an empty workflow visible in
`admin.transition.emptyNotice`. The settings menu links the page as `transitions`
(`auth.links.transitions` in de and en). `apps/web/src/admin/__tests__/transition-page.test.tsx`
proves the table, the guards, both forms, the confirmation dialog, the two rejects and the
empty-workflow notice. WP-M14-40, WP-M14-41, WP-M14-54 and WP-M14-70 … WP-M14-72 stay open in
numeric order.

**WP-M14-40 is implemented (the database layer of the `status_change` escalation action).** The
planned package mixed the database, the shared contract, the engine and the UI over the four-file
limit of `PLAN.md` §17 and named the taken migration number `0036` — that number belongs to
`0036_notification_verification.sql` — so it is split in this commit into **WP-M14-40** (the
database), **WP-M14-40b** (the contract and the engine) and **WP-M14-40c** (the administration
UI); the three documents exist here and run in numeric order. Migration
`0042_escalation_action_status_change.sql` drops `escalation_actions_type_check` of `0031` and
recreates it with the fourth type `status_change`; `apps/api/src/db/schema.ts` mirrors the CHECK
and the journal reaches `0042`. The target status lives in the `config` jsonb (`{ toStatus }`) —
a foreign key is impossible in jsonb, so the service validates it against `ticket_statuses` in
WP-M14-40b with the `400 invalid_status_key` rule of WP-M14-39 — and no new column and no existing
action row is touched. `specs/07-escalation.md` §7.5 gains the `status_change` row and §7.12
replaces the boundary that the escalation never changes a ticket state: only such an action moves
the status, and only through a step of the `ticket_transitions` table of WP-M14-38a (ADR-0025).
WP-M14-40b, WP-M14-40c, WP-M14-41, WP-M14-54 and WP-M14-70 … WP-M14-72 stay open in numeric order.

**WP-M14-40b is implemented (the shared contract of the `status_change` action and the engine
that performs it).** `ESCALATION_ACTION_TYPES` gains `status_change` and the discriminated union
in `packages/shared/src/schemas/escalation-config.ts` gains the variant `{ key, type: 'status_change',
toStatus, condition }` with `toStatus` bound to `ticketStatusKeySchema`. `apps/api/src/escalation/config.ts`
maps the action onto the `config` jsonb (`{ toStatus }`) in `actionConfig` and `writeEscalationConfig`
rejects a target that names no row of `ticket_statuses` with `400 invalid_status_key` and the field
path `rules.<i>.actions.<j>.toStatus` — the service rule of WP-M14-39, now on the escalation side,
because the jsonb of WP-M14-40 can carry no foreign key. `apps/api/src/escalation/actions.ts` performs
the step: a `status_change` action whose condition matches finds the **active** row of `ticket_transitions`
that leads from the current status of the ticket to the target (`readTicketTransitions`), runs it
through `transitionTicket()` (`actorKind: 'system'`, the payload carries the rule and the stage,
never a contact), appends one `escalation_note` event `{ rule, stage, from, to }` and counts the move
in the `statusChanged` counter of `EscalationActionResult`; without such a step the action changes
nothing. The shared unit test of the new variant, the fired-rule case of
`apps/api/src/escalation/__tests__/actions.integration.spec.ts` (status moved once, the step event
and the note written, a second scan a no-op) and the `400 invalid_status_key` of
`config-routes.integration.spec.ts` prove it. WP-M14-40c, WP-M14-41, WP-M14-54 and WP-M14-70 …
WP-M14-72 stay open in numeric order.

**WP-M14-40c is implemented** (the administration offers the `status_change` action): `apps/web/src/admin/escalation-page.tsx`
reads the statuses with the existing administration route `GET /api/v1/admin/statuses` (WP-M14-36,
`settings.read`) as a TanStack query and passes the **active** status keys into `RuleForm` and on into
`EscalationActionEditor`. `apps/web/src/admin/escalation-action-editor.tsx` renders the new type with its
label and a single-select target-status field (`admin.escalation.action.statusTarget`) over those keys;
`shapeOf` and `actionOf` carry `toStatus` and the client validates the key with `ticketStatusKeySchema`
before the request, so an existing status key never enters an invalid body and an action without a target
stays unsaved. The labels `admin.escalation.action.types.status_change` ("Status change") and `admin.escalation.action.statusTarget`
("Ziel-Status"/"Target status") are added to the `settings` namespace in `de` and `en`; `apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx`
proves the option, the target select over the configured statuses (the inactive status is not offered), that the saved
body carries `toStatus` and that a `status_change` action without a target stays unsaved. No API, schema or migration
change. WP-M14-41, WP-M14-54 and WP-M14-70 … WP-M14-72 stay open in numeric order.

**WP-M14-41 is implemented** (the time of the day becomes a condition of an escalation rule): `escalationConditionLeafSchema`
in `packages/shared/src/schemas/escalation-config.ts` gains the leaf `time_of_day` with the operators `in`/`notIn`
and the interval value `HH:MM-HH:MM` (`TIME_OF_DAY_INTERVAL_PATTERN`, one interval or an array of them);
`evaluateEscalationCondition()` evaluates it against the wall clock of `Europe/Berlin` — the display timezone of
`PLAN.md` §Time, which resolves the WP's open question, never the server timezone or UTC — through
`wallClockMinutes()`, the DST-safe `minutesOfDay()` (`date-fns-tz`) and `timeOfDayIntervalMatches()` in
`packages/shared/src/escalation.ts`: the start is included, the end excluded (`06:00-22:00` and `22:00-06:00`
split day and night) and an interval may cross midnight (`22:00-00:00`); an interval that names no clock time
never matches. `EscalationFacts` gained the optional `timeOfDay` fact so the evaluation stays deterministic in
the unit tests and falls back to the current wall clock when the engine does not carry one. `specs/07-escalation.md`
§7.4 carries the new row and its semantics, the settings namespace gained the label
`admin.escalation.condition.fields.time_of_day` in `de` and `en` (the condition builder reads its field list
from the shared contract, so the new field stays localized) and `packages/shared/src/__tests__/escalation.test.ts`
proves the match inside and outside an interval, the midnight transition, the array of intervals, an impossible
interval and a malformed leaf. No route, database or migration change — a rule already stores its condition as
`condition_json`. **WP-M14-54 is implemented** (out of band in phase 14, requested
by the office): the own channels page `apps/web/src/settings/notifications-page.tsx`
renders one `Link` to `/admin/channels` under the header hint with the label
`notifications.administration.link` — text only, no permission check, no extra
fetch — and the ntfy fallback branch (no QR because the instance has no target)
names the destination as a second line with the hint
`notifications.administration.hint` and the same link. `de` and `en` `common.json`
gain the two keys (`Kanal-Administration (Administration → Channels)` /
`Channel administration (Administration → Channels)`), `specs/10-notifications.md`
§11.12 records that each page links to the other exactly once (the symmetric
counterpart of the `personalLink` of WP-M14-48) and `apps/web/src/settings/__tests__/notifications-page.test.tsx`
asserts both links with `href="/admin/channels"` and the translated label. The two
pages stay apart (the administration keeps the secrets, the test send and the
minimum channels behind `notification.write`) and `apps/web/src/admin/channels-page.tsx`
is untouched. WP-M14-70 … WP-M14-72 stay open in numeric order.
**WP-M14-70 is implemented** (the setup script of the ntfy access control list and
token): `scripts/ntfy-setup.sh` runs every ntfy command inside the container of the
profile over `docker compose --profile ntfy exec --no-tty ntfy ntfy …`, so it needs
no CLI on the host. It refuses without a Docker daemon, without `.env`, while the
ntfy container is not running (`ntfy config check`) and while
`ntfy config read auth-default-access` is not `deny-all` — the script never widens
a looser server. It creates the user `stoerdesk-api` with role `user` only when
`ntfy user list` does not know it, then sets `ntfy access stoerdesk-api
"stoerdesk-*" read-write` and `ntfy access everyone "stoerdesk-*" read-only`
(idempotent: a second run changes nothing) — the anonymous read entry is what lets
a phone subscribe through the QR code with no login (ADR-0024 point 6). Only while
the `NTFY_TOKEN` line of `.env` is empty it runs `ntfy token add stoerdesk-api`,
keeps the printed `tk_…` value in a variable, writes it into `.env` with a `sed` on
that single key and never prints it; a non-empty `NTFY_TOKEN` is kept and never
shown (the token is a secret of the same class as `POSTGRES_PASSWORD`).
`package.json` gained `npm run ntfy:setup` as `sh scripts/ntfy-setup.sh` (the
pattern of `update:host`). `sh -n` and shellcheck are clean (only the `CDPATH= cd`
idiom warning `scripts/update.sh` carries too); the manual check on a running
profile (403 anonymous publish to `stoerdesk-pruef`, 200 with the token, 403
anonymous read of `anderes`) is **unverified**: this development container has no
Docker daemon. WP-M14-71 … WP-M14-72 stay open in numeric order.
**WP-M14-72 is implemented** (the random ntfy topic per user and the backup of the
ntfy volume, ADR-0024 point 6 and consequences, phase 14 closed): `accounts.ts`
exports `newNtfyTopic()` (`stoerdesk-` plus 16 random hex bytes — 128 bits) and
`storeAccount` provisions an empty ntfy `externalId` with it, so the server owns
the subscription topic; `ntfyRecipients` in `receivers.ts` answers the stored
topics only — the `stoerdesk-<userId>` fallback is removed and a user without an
ntfy account gets no ntfy message (`userTopic` stays for the internal paths of
`outbox.ts`). The `backup` service mounts `ntfydata` read-only at `/data/ntfy` and
tars it into `stoerdesk-<stamp>-ntfy.tar.gz`; the archive carries no plaintext
token (ntfy hashes it). `receivers.unit.spec.ts` proves prefix, entropy,
deduplication and the missing topic; the outbox unit spec and the phase-14 exit
spec reconnect their user B over a stored random topic. The SQL count of existing
derived-topic accounts and `docker compose config` are unverified here (no
instance database, no Docker daemon). One defect stays visible: the subscription
route of `routes.ts` still answers the derived `stoerdesk-<userId>` topic, outside
the files of the WP — so **WP-M14-72b** (the subscription QR shows the stored topic)
is drafted as the follow-up of WP-M14-72 in this commit and stays open.
WP-M14-72b stays open in numeric order.
**WP-M14-72b is implemented** (the subscription QR shows the stored topic):
`GET /api/v1/notifications/accounts/ntfy` in `apps/api/src/notifications/routes.ts`
answers the stored `external_id` of the ntfy account of the session user — the
subscription address and the `ntfy://<host>/<topic>` deep link now point at the
topic `ntfyRecipients` publishes to, so a phone that scans the QR receives the
messages of that user. A user without an ntfy account is provisioned through
`storeAccount` with a fresh random topic from `newNtfyTopic()` (ADR-0024 point 6:
visiting the QR connects the user, the server creates the topic); a repeat visit
keeps the stored topic and writes nothing. An unconfigured ntfy server still
answers the empty subscription. No migration or rotation of existing topics,
the adapters, the outbox and `receivers.ts` are untouched, no new route,
permission key or session-guard change. The extended
`apps/api/src/notifications/__tests__/routes.unit.spec.ts` proves the stored
topic, the provisioning of a `stoerdesk-`-prefixed 128-bit random topic and the
stable topic over two visits. Phase 14 has no open follow-up left.

**Phase 14 is closed (WP-M14-73 … WP-M14-75).** All 82 packages of `work-packages/m14/` are
implemented and the two exit criteria of the phase are proven by their
integration tests — WP-M14-21 (`phase14-exit.integration.spec.ts`: the selection
of the user decides the channels of a ticket, the mandatory minimum channels of a
critical ticket are queued whatever the selection says, a failed channel warns
and the chain continues, and no secret of a channel or of an account leaves the
server) and WP-M14-67 (`stage-chain-exit.integration.spec.ts`: the configurable
stage chain replaces the fixed stages of ADR-0017). The four documents
WP-M14-23 … WP-M14-26 still carried `status: planned` although their packages
landed long ago (`604e9d8`, `8e7c9cf`, `4316b58`, `6f8a93b`); the field now reads
`done`, so the documents and this backlog agree. The decisions of the phase are
settled (ADR-0019 … ADR-0025), `PLAN.md` §19 carries no open decision of the
phase and no follow-up is open. The check run of the closing commit was red in
the job `Docker smoke test` — `docker compose` interpolates every service of the
file, also the ones of a profile that is not selected, so the strict
`${CLOUDFLARE_TUNNEL_TOKEN:?…}` of WP-M14-71 stopped the config of the core
stack of every deployment without a tunnel; **WP-M14-74** reads the token as
`${CLOUDFLARE_TUNNEL_TOKEN:-}` and the setup script names the missing key; the
next check run was still red in the same job — the long syntax of `depends_on`
needs the `condition` beside the `required`, and WP-M14-71 wrote only
`required: false` — **WP-M14-75** adds `condition: service_started` and the
file passes the schema of the Compose specification. The next phase starts with
its own split.

**The work order of the office (WP-M14-76, out of band in phase 14, requested by
the office).** The office reported the generic "Die Aktion konnte nicht
ausgeführt werden." when it reached the stage "Auftrag angelegt" of the ticket
view. The view sends the free text field of WP-M14-43 (`{ text }`), but the
office route still validated the body against the schema `{ type, number }` of
WP-M2-19c — the contract WP-M14-42 replaced with the free text. Every work order
of the office therefore answered `400 invalid_request`, and the ticket view
answered the generic text, because that error code has no translation in
`detail.errors`. **WP-M14-76** deletes the local schema and uses the shared
`workOrderRequestSchema` — the same contract as the external route
(`PATCH /api/v1/tickets/:ticketNo/work-order`) and as `transitionTicket()`,
which writes `payload.text` into `tickets.work_order_text`. The row of
`specs/08-objects-api.md` §9.3 names the new body. The generic text itself is
repaired by WP-M14-77, the offered stages by WP-M14-78.

**The failed action names its reason (WP-M14-77, out of band in phase 14,
requested by the office).** The generic "Die Aktion konnte nicht ausgeführt
werden." hid every reason: `actionErrorMessage()` of the ticket view looks the
error code of the API up in `detail.errors`, and that namespace only knew the
codes of the delete — `invalid_request`, `invalid_transition`,
`ticket_not_found`, `session_invalid` and `forbidden` fell back to the generic
text. **WP-M14-77** gives the five codes a text in `de` and `en`; the message of
`invalid_transition` names the status of the ticket (the label of
`status.values.<key>`, the raw key for a status the administration added), and
an unknown code keeps the generic notice. The office sees why the action
failed — a rejected input, a step that the current status does not allow, an
expired session or a missing permission.

**The offered stages come from the transition table (WP-M14-78, out of band in
phase 14, requested by the office).** The ticket view offered a stage whose step
the engine then rejected (`409 invalid_transition`), whenever the administration
had edited the rows of `ticket_transitions`: `readReachableStages()` derived the
allowed events from the code map `TRANSITIONS`, while `transitionTicket()` read
the table — the consequence ADR-0025 announced for WP-M14-40 and WP-M14-41.
**WP-M14-78** reads the table in both views of the escalation layer: a stage is
offered while one of its `reached_by` events is an **active** row whose
`from_status` is the current status, and the stage chain names the event keys of
the table. The code map has no reader left and is removed, so a single source of
truth remains. **WP-M14-86** closes the second half of the same report: the
acknowledge panel asked its result as free text whose placeholder listed the raw
values of the API (`fixed`, `partially_fixed`, …), so a typo answered
`400 invalid_request`. The panel offers the four values as a selection now, with
a label per value (`detail.acknowledgeResult.*`) and the confirm button disabled
until one is chosen.

**The escalation offers and assigns tickets (WP-M14-79 … WP-M14-85, out of band
in phase 14, requested by the office).** The office asked for two more actions
of an escalation rule: a ticket that waits too long for a technician shall be
**offered** to a pool of technicians, and a ticket shall be **assigned** to
technicians. Until now a rule could only notify, write a webhook, write a note
or change the status (`specs/07-escalation.md` §7.5) — the actions were side
effects, and `PLAN.md` §9 and §7.12 said so in one sentence. The office answered
the two questions of the design: the target is **a readiness pool or a user
group** (both are selectable), and the assignment reaches **all** technicians of
that target. **WP-M14-79** is the spec and the decision (ADR-0026): the two new
action types `offer` and `assign` carry a `target` (`{ kind, id }`), the
assignment is recorded in the new table `ticket_assignees`, the offer of a pool
target names the on-call person in `offered_to_user_id` and sets the offer
timeout, and the broadcast reaches the technicians on their own ntfy topic. The
children follow in numeric order: **WP-M14-80** (the database — migration `0043`
widens the CHECK of the action types, `0044` adds `ticket_assignees`),
**WP-M14-81** (the shared contracts), **WP-M14-82** (the engine — the dispatcher
performs the `offered` and the `assigned` step of the transition table),
**WP-M14-83** (the configuration service — a target that names no pool and no
group answers `400 invalid_target`), **WP-M14-84** (the administration — the two
types with their kind and target select) and **WP-M14-85** (the ticket view
names the assignees). The numbers WP-M14-77 and WP-M14-78 belong to the
announced follow-ups of WP-M14-76 and are not touched by this series.

**The readiness calendar names the state and the pool of every shift (WP-M14-87,
out of band in phase 14, requested by the office).** The office reported that the
readiness calendar knows only one label: the row of a shift in a day cell named
its technician or answered `oncall.readiness.unassigned` ("nicht besetzt"), while
the state and the pool of that shift stayed invisible in the cell's `title` and in
a screen-reader span — WP-M10-41 moved them out of the visible row, against the
rule WP-M10-33 set ("every row names the pool, the technician and … shows its
state") and against the promise of `docs/REPO-MAP.md`. **WP-M14-87** puts the
state label (`oncall.admin.state.*`) and the pool name into visible text beside
the technician, keeps the coloured dot, the colour of the day and the legend and
lets the day cell grow (`min-h-20`) so the labels of a row stay readable; the
`title` names the same three things. No
i18n key is added and the API stays untouched.

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
| WP-M1-28  | CI hardening: pre-push guard, promote gate, deploy job, smoke fails  | done                    | yes     |
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
| WP-M2-80  | remove systems level from DB schema                                 | done                    | yes     |
| WP-M2-81  | remove systems level from shared schemas                            | done                    | yes     |
| WP-M2-82  | remove systems level from ticket API                                | done                    | yes     |
| WP-M2-83  | remove systems level from object API                                | done                    | yes     |
| WP-M2-84  | remove systems level from report form                               | done                    | yes     |
| WP-M2-85  | remove systems level from internal create                           | done                    | yes     |
| WP-M2-86  | remove systems level from object UI                                 | done                    | yes     |
| WP-M2-87  | remove systems level from i18n                                      | done                    | yes     |
| WP-M2-88a | remove systems level from API tests part 1                          | done                    | yes     |
| WP-M2-88b | remove systems level from API tests part 2                          | done                    | yes     |
| WP-M2-88c | remove systems level from web test and seed                         | done                    | yes     |
| WP-M2-89  | public report optional title with the branding switch (backend)     | done                    | yes     |
| WP-M2-90  | public QR resolve carries `titleEnabled`                            | done                    | yes     |
| WP-M2-90b | branding page title checkbox                                        | done                    | yes     |
| WP-M2-90c | report form optional title field                                    | done                    | yes     |
| WP-M2-91  | always visible ticket detail action panel with inline fields       | done                    | yes     |
| WP-M2-91b | mobile-first ticket list cards                                      | done                    | yes     |
| WP-M2-92  | `users.theme` column and migration 0016                             | done                    | yes     |
| WP-M2-92b | theme through the session and the login response                | done                    | yes     |
| WP-M2-92c | theme in the shared schemas and in the admin user API              | done                    | yes     |
| WP-M2-92d | theme class in the shell and light palette in styles.css            | done                    | yes     |
| WP-M2-92e | theme select in the user settings (users page)                      | done                    | yes     |
| WP-M2-93  | `users.given_name`/`users.family_name` and migration 0018          | done                    | yes     |
| WP-M2-94  | name fields in the shared schemas and the admin user API            | done                    | yes     |
| WP-M2-94b | name fields in the users page UI                                    | done                    | yes     |
| WP-M2-95  | internal ticket creation honours the branding title switch          | done                    | yes     |
| WP-M2-98  | reporter metadata columns and migration 0028                       | done                    | yes     |
| WP-M2-98b | internal create accepts report time, channel and reporter kind      | done                    | yes     |
| WP-M2-98c | internal create form captures reporter, channel and report time     | done                    | yes     |
| WP-M2-98d | timeline shows report time and capture time                         | done                    | yes     |
| WP-M2-98e | ticket detail shows report time, channel and reporter kind          | done                    | yes     |
| WP-M3-01  | offline background sync matches the API path                        | done                    | yes     |
| WP-M3-02  | the update script removes the images it replaces                    | done                    | yes     |
| WP-M3-02b | the update agent removes the images it replaces                     | done                    | yes     |
| WP-M3-03  | the agent start command finds the project dir on the host           | done                    | yes     |
| WP-M3-04  | the start command pins `--project-directory` and fills `.env`       | done                    | yes     |
| WP-M3-04b | der Startbefehl bricht ohne `docker-compose.yml` ab                 | done                    | yes     |
| WP-M3-05  | shared error code `update_step_timeout` for self-update           | done                    | yes     |
| WP-M3-06  | the update agent run can never hang forever                       | done                    | yes     |
| WP-M3-07  | the update contract (spec §18, ADR-0007) and the GitHub client     | done                    | yes     |
| WP-M3-08  | the update API: `check` and `start` with the environment keys      | done                    | yes     |
| WP-M3-09  | the deployment configuration of the update control                  | done                    | yes     |
| WP-M3-10  | the update menu in the shell header                                | done                    | yes     |
| WP-M3-11  | the removal of the update agent                                   | done                    | yes     |
| WP-M3-12  | the documentation of the new update control                        | done                    | yes     |
| WP-M3-13  | the not found page and the error boundary of the router            | done                    | yes     |
| WP-M3-14  | the update menu tells a lost connection from a refused webhook     | done                    | yes     |
| WP-M3-15  | host deploy hook for the update menu (`npm run deploy:hook`)         | done                    | yes     |
| WP-M3-16  | update.sh compares the running version, not the folder             | done                    | yes     |
| WP-M3-17  | forced pre-migration database dump before the API starts            | done                    | yes     |
| WP-M4-01  | Ticket workflow E2E test — complete workflow with audit trail       | done                    | yes     |
| WP-M4-06  | fix ticket hard-delete blocked by append-only trigger               | done                    | yes     |
| WP-M5-01  | the outbox stores queued internal actions (Dexie v2)                | done                    | yes     |
| WP-M5-02  | `internal_action_receipts` table and migration 0013                     | done                    | yes     |
| WP-M5-03  | `applyInternalAction`: replay-safe acknowledge/comment/decline      | done                    | yes     |
| WP-M5-04  | `clientUuid` on the action routes + internal comment route          | done                    | yes     |
| WP-M5-05  | the detail page queues actions offline and replays them             | done                    | yes     |
| WP-M5-06  | conflict UI: failed and conflicting offline writes stay visible     | done                    | yes     |
| WP-M5-07  | stale-while-revalidate cache for internal ticket reads              | done                    | yes     |
| WP-M5-08  | offline internal actions E2E — phase 5 exit criterion               | done                    | yes     |
| WP-M5-09  | sign-out clears the `internal-tickets` cache                        | done                    | yes     |
| WP-M5-10  | comment POST sends its client uuid; standalone comment box           | done                    | no      |
| WP-M5-11  | comment composer facelift and readable history entries               | done                    | no      |
| WP-M5-12  | missing ticket event and source translations                         | done                    | no      |
| WP-M5-13  | remaining admin error-code translations                              | done                    | no      |
| WP-M5-14  | history actor names from the directory, not the login                | done                    | no      |
| WP-M5-15  | history actors as name or "Extern: name"                             | done                    | no      |
| WP-M5-16  | workflow E2E expects the actor name, not the actor kind              | done                    | yes     |
| WP-M5-17  | the ticket view shows a write immediately                             | done                    | yes     |
| WP-M5-18  | comment confirmation and browser spell check                          | done                    | yes     |
| WP-M6-01  | phase-6 specification, ADR-0008 and work-package split              | done                    | yes     |
| WP-M6-02  | shared deadline and timeline contracts                              | done                    | yes     |
| WP-M6-03  | per-priority deadlines on ticket creation                           | done                    | yes     |
| WP-M6-04  | `ticket_pauses` table and migration 0014                            | done                    | yes     |
| WP-M6-05  | pause service                                                       | done                    | yes     |
| WP-M6-06  | pause routes and acknowledge auto-close                             | done                    | yes     |
| WP-M6-07  | escalation rule definitions                                         | done                    | yes     |
| WP-M6-08  | escalation scan and event writer                                    | done                    | yes     |
| WP-M6-09  | pg-boss escalation job                                              | done                    | yes     |
| WP-M6-10  | timeline and pause data in the ticket API                           | done                    | yes     |
| WP-M6-11  | web timeline bar and pause controls                                 | done                    | yes     |
| WP-M6-12  | list mini timeline and remaining time                               | done                    | yes     |
| WP-M6-13 | phase-6 exit criterion and record   | done                    | yes     |
| WP-M6-14  | deadline and reaction settings contract (shared schema)             | done                    | yes     |
| WP-M6-14b | deadline settings route `GET/PUT /api/v1/settings/deadlines`        | done                    | yes     |
| WP-M6-15  | deadline admin page `DeadlinesPage` (de/en)                         | done                    | yes     |
| WP-M6-16  | `/admin/deadlines` route and the available menu entry               | done                    | yes     |
| WP-M6-17  | effective deadline hours readable with `ticket.create`             | done                    | yes     |
| WP-M6-18  | priority select shows the configured deadline                      | done                    | yes     |
| WP-M7-01  | ntfy channel adapter and its env wiring                             | done                    | yes     |
| WP-M7-02  | ntfy channel unit test                                              | done                    | yes     |
| WP-M7-03  | ntfy QR code, onboarding and i18n label                             | done                    | yes     |
| WP-M7-04  | outbox rows in the ticket create transaction                        | done                    | yes     |
| WP-M7-04b | the localized ntfy action label                                   | done                    | yes     |
| WP-M7-04c | the outbox drain worker, its retries and its pg-boss schedule      | done                    | yes     |
| WP-M7-05  | the notification channel fallback chain                                       | done                    | yes     |
| WP-M7-06  | the phase-7 exit criterion and record                                         | done                    | yes     |
| WP-M7-07  | the e-mail channel adapter over SMTP (nodemailer, ADR-0009)               | done                    | yes     |
| WP-M7-08  | the Telegram channel adapter over the Bot API (`fetch`)                | done                    | yes     |
| WP-M7-09  | the Web Push (VAPID) channel adapter over `web-push` (ADR-0010)        | done                    | yes     |
| WP-M7-10  | matrix and signal channels — locale, deep link and the localized label | done                    | yes     |
| WP-M8-01  | phase-8 specification, ADR-0011 and the work-package split          | done                    | yes     |
| WP-M8-02  | on-call tables and migration 0020                                   | done                    | yes     |
| WP-M8-03  | DST-safe on-call slot calculation                                   | done                    | yes     |
| WP-M8-04  | on-call pool API                                                    | done                    | yes     |
| WP-M8-05  | on-call settings and shift planning service                         | done                    | yes     |
| WP-M8-06  | on-call shift and settings routes                                   | done                    | yes     |
| WP-M8-07  | shift confirm and decline                                           | done                    | yes     |
| WP-M8-08  | swap request and atomic acceptance service                          | done                    | yes     |
| WP-M8-09  | swap routes                                                         | done                    | yes     |
| WP-M8-10  | on-call ticket coupling and warnings                                | done                    | yes     |
| WP-M8-11  | on-call offer timeout to the group                                  | done                    | yes     |
| WP-M8-12  | personal on-call iCal feed                                          | done                    | yes     |
| WP-M8-13  | on-call administration page                                         | done                    | yes     |
| WP-M8-13b | pending swap list route `GET /api/v1/oncall/swaps`                  | done                    | yes     |
| WP-M8-14  | my on-call shifts page                                              | done                    | yes     |
| WP-M8-14b | on-call self-service read routes                                    | done                    | yes     |
| WP-M8-15  | offline shift confirm and decline                                   | done                    | yes     |
| WP-M8-16  | phase-8 exit criterion and record                                   | done                    | yes     |
| WP-M9-01  | dashboard and statistics specification, ADR-0012 and phase-9 split  | done                    | yes     |
| WP-M9-02  | `tickets.is_test` flag                                              | done                    | yes     |
| WP-M9-03  | statistics SQL views                                                | done                    | yes     |
| WP-M9-04  | shared dashboard and statistics contracts                           | done                    | yes     |
| WP-M9-05  | dashboard service                                                   | done                    | yes     |
| WP-M9-06  | dashboard route                                                     | done                    | yes     |
| WP-M9-07  | dashboard SSE stream                                                | done                    | yes     |
| WP-M9-08  | dashboard settings                                                  | done                    | yes     |
| WP-M9-09  | TV display route                                                    | done                    | yes     |
| WP-M9-10  | statistics: reaction times and frequency                           | done                    | yes     |
| WP-M9-11  | statistics: objects and compliance                                 | done                    | yes     |
| WP-M9-12  | statistics routes                                                   | done                    | yes     |
| WP-M9-13  | statistics CSV export                                               | done                    | yes     |
| WP-M9-14  | web dashboard                                                       | done                    | yes     |
| WP-M9-15  | web statistics page                                                 | done                    | yes     |
| WP-M9-16  | web TV page                                                         | done                    | yes     |
| WP-M9-17  | web dashboard settings                                              | done                    | yes     |
| WP-M9-18  | phase-9 exit criterion and record                                   | done                    | yes     |
| WP-M9-19  | dashboard tiles without the burning-now list                        | done                    | yes     |
| WP-M9-20  | ticket list order: open tickets by the deadline                     | done                    | yes     |
| WP-M9-21  | ticket list rows with the timeline in the middle                    | done                    | yes     |
| WP-M9-22  | milestone markers on the timeline bar                               | done                    | yes     |
| WP-M9-23  | one reading point for the branding title switch                     | done                    | yes     |
| WP-M9-24  | ticket view honours the branding title switch                     | done                    | yes     |
| WP-M9-25  | internal creation form honours the branding title switch          | done                    | yes     |
| WP-M9-26  | record: object list facelift (commit `d1e34eb` without a WP)      | done                    | yes     |
| WP-M9-27  | ticket_purges append-only and reason length cap (SEC-013)         | done                    | yes     |
| WP-M9-28  | shared LIKE escaping for ticket and object search (SEC-012)       | done                    | yes     |
| WP-M9-29  | ticket number validated at the entry points (SEC-015)             | done                    | yes     |
| WP-M9-30  | workflow, delete, photo and comment route hardening               | done                    | yes     |
| WP-M9-31  | report photo preflight before the ticket transaction (SEC-014)    | done                    | yes     |
| WP-M9-32  | branding logo magic-byte check (SEC-019)                          | done                    | yes     |
| WP-M9-33  | iCal feed expiry, active recheck, log redaction (SEC-005/011)     | done                    | yes     |
| WP-M9-34  | SESSION_SECRET min length + logout cookie presence (SEC-016/006)  | done                    | yes     |
| WP-M9-35  | remove the dead prefix on the on-call pools plugin (SEC-010)      | done                    | yes     |
| WP-M9-36  | public comment route: status token + throttle (SEC-004, API)      | done                    | yes     |
| WP-M9-37  | public comment web flow: honeypot + captcha + mismatch notice     | done                    | yes     |
| WP-M9-38  | BMAcloud credentials GET needs object.import (SEC-009)            | done                    | yes     |
| WP-M9-39  | the dashboard stream captures its baseline before the first snapshot | done                  | yes     |
| WP-M10-01 | API and hardening specification, ADR-0013/0014 and phase-10 split | done                    | yes     |
| WP-M10-02 | API-key table, shared contracts and migration                     | done                    | yes     |
| WP-M10-03 | admin API-key routes and hashing service                          | done                    | yes     |
| WP-M10-04 | admin API-key page                                                | done                    | yes     |
| WP-M10-05 | bearer API-key authentication and scope guard                     | done                    | yes     |
| WP-M10-06 | OpenAPI document under `/api/docs`                                | done                    | yes     |
| WP-M10-07 | external object API with updated-since, upsert and bulk           | done                    | yes     |
| WP-M10-08 | external ticket API and API-key work-order update                 | done                    | yes     |
| WP-M10-09 | webhook endpoints, table and admin API                            | done                    | yes     |
| WP-M10-10 | webhook delivery worker with HMAC and backoff                     | done                    | yes     |
| WP-M10-11 | webhook admin page and OpenAPI paths                              | done                    | yes     |
| WP-M10-12 | CSV parsing, mapping and preview service                          | done                    | yes     |
| WP-M10-13 | CSV import preview and commit routes                             | done                    | yes     |
| WP-M10-14 | CSV import page                                                   | done                    | yes     |
| WP-M10-15 | privacy retention job                                             | done                    | yes     |
| WP-M10-16 | personal-data export and erasure routes                           | done                    | yes     |
| WP-M10-17 | uploads backup, restore procedure and drill                       | done                    | yes     |
| WP-M10-18 | phase-10 exit criterion and record                                | done                    | yes     |
| WP-M10-19 | dashboard evaluations: average durations, no worst value          | done                    | yes     |
| WP-M10-19b | evaluation block on the dashboard start page                     | done                    | yes     |
| WP-M10-30  | the open tickets of the snapshot carry the mini timeline and the last event | done                    | yes     |
| WP-M10-31  | one list of the open tickets for the dashboard and the wall display    | done                    | yes     |
| WP-M10-32  | the start page shows the statistics and the open tickets               | done                    | yes     |
| WP-M10-33  | the readiness calendar of the office                                   | done                    | yes     |
| WP-M10-34  | the on-call page shows the calendar and the own readiness              | done                    | yes     |
| WP-M10-35  | "Bereitschaft" becomes a menu entry of its own                         | done                    | yes     |

| WP-M10-36  | one display for the dashboard and the wall monitor, links off on the wall | done                  | yes     |

| WP-M10-40  | shell header: logo left, menu centred, mobile tab strip                 | done                    | yes     |
| WP-M10-41  | readiness calendar: two month grids, KW column, state colours           | done                    | yes     |
| WP-M10-20 | fault catalog ordered by recent usage in the report and office forms | done                    | yes     |
| WP-M10-20b | fault catalog management screen keeps its alphabetical order    | done                    | yes     |
| WP-M10-21 | dashboard snapshot carries the most frequent fault              | done                    | yes     |
| WP-M10-21b | most frequent fault on the dashboard start page                | done                    | yes     |
| WP-M11-11  | ticket detail names the reported fault type                      | done                    | yes     |
| WP-M11-12  | the internal report-time warning is German again                | done                    | yes     |
| WP-M11-01  | detected errors — specification, ADR and phase-11 split        | done                    | yes     |
| WP-M11-02  | `detected_errors`-Tabelle und `tickets.detected_error_keys`    | done                    | yes     |
| WP-M11-03  | API CRUD `/api/v1/detected-errors`                             | done                    | yes     |
| WP-M11-04  | Close-Route akzeptiert Kommentar und festgestellte Fehler      | done                    | yes     |
| WP-M11-05  | Statistik: `byDetectedError` und View-Erweiterung              | done                    | yes     |
| WP-M11-06  | Admin-UI `DetectedErrorsPage` (CRUD, archivieren)              | done                    | yes     |
| WP-M11-07  | Ticket-Detail Close-Panel mit festgestellten Fehlern           | done                    | yes     |
| WP-M11-08  | Statistik-UI `byDetectedError`-Chart                           | done                    | yes     |
| WP-M11-09  | Integrationstests (API, Close, Statistik)                      | done                    | yes     |
| WP-M11-10  | Phase-11 Exit-Kriterium und Record                             | done                    | yes     |
| WP-M12-01  | acceptance criteria slice and phase-12 split                     | done                    | yes     |
| WP-M12-02  | acceptance end-to-end suite for items 1–12                      | done                    | yes     |
| WP-M12-03  | escalation-stage catalog — shared contract and settings API     | done                    | yes     |
| WP-M12-04  | admin UI for escalation stages                                  | done                    | yes     |
| WP-M12-05  | manual escalation write API                                     | done                    | yes     |
| WP-M12-06  | ticket detail — menu removed, escalation section added          | done                    | yes     |
| WP-M12-07  | settings overview page `/settings`, grouped by topic                | done                    | yes     |
| WP-M12-08  | shell gear opens the settings page — dropdown removed             | done                    | yes     |
| WP-M12-09  | ticket detail — e-mail icon and cancel in the header, no back button | done                  | yes     |
| WP-M13-01  | escalation stages as the workflow milestones — spec, ADR-0017, phase split | done                  | yes     |
| WP-M13-02  | shared contracts of the escalation configuration                   | done                    | yes     |
| WP-M13-03  | the escalation tables and the migration `0031`                     | done                    | yes     |
| WP-M13-04  | the seed of the stages and the rules                              | done                    | yes     |
| WP-M13-05  | the configuration API of the escalation                           | done                    | yes     |
| WP-M13-06  | the engine on the database rules                                 | done                    | yes     |
| WP-M13-07a | the webhook event type of the escalation                          | done                    | yes     |
| WP-M13-07b | the actions of a fired rule (notify, webhook, history)            | done                    | yes     |
| WP-M13-08  | the reachable stages of a ticket                                 | done                    | yes     |
| WP-M13-09  | the stage selection replaces the workflow buttons                 | done                 | yes     |
| WP-M13-10  | the removal of the old escalation API                            | done                 | yes     |
| WP-M13-11  | the removal of the old shared contracts                          | done                 | yes     |
| WP-M13-12  | the removal of the old administration page                       | done                 | yes     |
| WP-M13-13  | the cleanup of the texts and of the legacy settings              | done                 | yes     |
| WP-M13-14  | the administration page of the escalation                        | done                 | yes     |
| WP-M13-15  | the rule editor and the condition builder                        | done                 | yes     |
| WP-M13-16  | the action editor                                               | done                 | yes     |
| WP-M13-17  | the exit criterion of the escalation phase                       | done                 | yes     |
| WP-M13-18  | the escalation page speaks the language of the interface          | done                 | yes     |
| WP-M14-01  | the administration home disappears — its links live in the settings menu | done              | yes     |
| WP-M14-02  | the administration pages lead back to the settings menu           | done                    | yes     |
| WP-M14-03  | the messenger channels — spec, ADR-0019, ADR-0020, phase split     | done                    | yes     |
| WP-M14-04  | the configuration of the channels in the database (migration 0033)  | done                   | yes     |
| WP-M14-05  | the API of the channel configuration                               | done                   | yes     |
| WP-M14-06  | the administration page of the channels                            | done                   | yes     |
| WP-M14-07  | the content of a message and the urgency of ntfy                   | done                   | yes     |
| WP-M14-08  | the accounts of the users                                          | done                   | yes     |
| WP-M14-09  | the Telegram linking via a one-time code                           | done                   | yes     |
| WP-M14-10  | the own channels — the page and the Telegram section               | done                   | yes     |
| WP-M14-11  | the Matrix account linking                                         | done                   | yes     |
| WP-M14-12  | the Matrix section of the settings page                            | done                   | yes     |
| WP-M14-13  | the ntfy onboarding with the QR of the subscription                | done                   | yes     |
| WP-M14-14  | the WhatsApp Web bridge as a channel                               | done                   | yes     |
| WP-M14-15  | the chats of the bridge and the WhatsApp Web account               | done                   | yes     |
| WP-M14-16  | the selection of the channels per event type — the API             | done                   | yes     |
| WP-M14-17  | the selection of the channels per event type in the settings page  | done                   | yes     |
| WP-M14-18  | the mandatory minimum channels of critical tickets                 | done                   | yes     |
| WP-M14-19  | the warning on a failed channel                                    | done                   | yes     |
| WP-M14-20  | the notifications of the internal ticket creation                  | done                   | yes     |
| WP-M14-21  | the exit criterion of the messenger channels                        | done                    | yes     |
| WP-M14-22  | the prepared send view replaces the e-mail and the pdf views (out of band) | done | yes     |
| WP-M14-23  | the escalation administration fully localized (out of band)                 | done    | yes     |
| WP-M14-24  | the escalation administration explains itself (out of band)                 | done    | yes     |
| WP-M14-25  | stage names label the reached-stage condition values (out of band)          | done    | yes     |
| WP-M14-26  | the readiness allocation — spec, ADR-0021 and the split of the chain       | done    | yes     |
| WP-M14-27  | the outbox and the preferences know the readiness (migration 0039)          | done    | yes     |
| WP-M14-28  | the readiness message, the shift enqueue and the shift branch of the drain | done    | yes     |
| WP-M14-29  | the allocation and a swap request enqueue their rows                       | done    | yes     |
| WP-M14-30  | an assigned readiness can be accepted (confirmable `DRAFT`)                 | done    | yes     |
| WP-M14-31  | an unconfirmed readiness reminds once                                       | done    | yes     |
| WP-M14-32  | the readiness selection of the technician in the settings page          | done      | yes     |
| WP-M14-34  | the prepared send view offers an HTML copy instead of the e-mail button (out of band) | done | yes     |
| WP-M14-33  | the ntfy deep link of the QR carries the host (out of band)               | done    | yes     |
| WP-M14-35  | configurable ticket statuses in the database (replaces hardcoded enum)    | done    | yes     |
| WP-M14-36  | ticket status management API (CRUD for statuses)                          | done    | yes     |
| WP-M14-37  | ticket status management UI (admin page for statuses)                     | done    | yes     |
| WP-M14-38  | the ticket transitions — spec, ADR-0025 and the split of the chain         | done    | yes     |
| WP-M14-38a | the transition table in the database (migration 0041)                    | done    | yes     |
| WP-M14-38b | the transition contracts and the transition service                      | done    | yes     |
| WP-M14-38c | the workflow engine reads the transition table                           | done    | yes     |
| WP-M14-39  | the ticket transition administration API (CRUD)                             | done    | yes     |
| WP-M14-39b | ticket transition management UI (admin page for transitions)              | done    | yes     |
| WP-M14-40  | status_change as escalation action — the database layer (migration 0042)  | done    | yes     |
| WP-M14-40b | the status_change contract and the engine (config jsonb, dispatcher)       | done    | yes     |
| WP-M14-40c | status_change in the escalation administration UI                          | done    | yes     |
| WP-M14-41  | time-based conditions for escalation rules (night/day workflows)          | done      | yes     |
| WP-M14-42  | work order as free text (API core: migration, schema, workflow, detail)   | done    | yes     |
| WP-M14-43  | work order as free text (UI + i18n)                                       | done    | yes     |
| WP-M14-44  | work order text column in the ticket list API                             | done    | yes     |
| WP-M14-45  | ntfy delivers the selected events to the topic of the user (out of band)  | done    | yes     |
| WP-M14-46  | the ntfy QR survives a missing Telegram bot (out of band)                 | done    | yes     |
| WP-M14-47  | ntfy counts as configured only after the code came back (out of band)     | done    | yes     |
| WP-M14-48  | the administration confirms the ntfy code (out of band)                   | done    | yes     |
| WP-M14-49  | a failed ntfy test send explains itself (out of band)                     | done    | yes     |
| WP-M14-50  | every ntfy error code explains itself (out of band)                       | done    | yes     |
| WP-M14-51  | the ntfy access token reaches every send (out of band)                    | done    | yes     |
| WP-M14-52  | ntfy 401 and 403 name the access token (out of band)                      | done    | yes     |
| WP-M14-53  | the ntfy request carries a timeout (out of band)                          | done    | yes     |
| WP-M14-54  | the own channels page links to the channel administration (out of band)   | done    | yes     |
| WP-M14-55  | the test send and the verification request carry a JSON body (out of band) | done    | yes     |
| WP-M14-56  | a rejected test request names its status and code (out of band)          | done    | yes     |
| WP-M14-57  | the copied ntfy curl is one shell command (out of band)                  | done    | yes     |
| WP-M14-58  | the escalation stage chain — spec, ADR-0023 and the split (out of band) | done    | yes     |
| WP-M14-59  | the stage chain in the database (migration 0037) (out of band)         | done    | yes     |
| WP-M14-60  | the shared contracts and the chain validator (out of band)             | done    | yes     |
| WP-M14-61  | the seed carries the stage chain (out of band)                         | done    | yes     |
| WP-M14-62  | the stage set is replaced as one validated chain (out of band)         | done    | yes     |
| WP-M14-63  | the escalation engine reads the stage chain (out of band)              | done    | yes     |
| WP-M14-64  | the available stages come from the stage chain (out of band)           | done    | yes     |
| WP-M14-65  | the administration adds, removes and chains stages (out of band)       | done    | yes     |
| WP-M14-66  | the stage tab of the administration is tested (out of band)            | done    | yes     |
| WP-M14-67  | the configurable stage chain satisfies its criterion (out of band)     | done    | yes     |
| WP-M14-68  | every notification message links to its ticket (out of band)      | done    | yes     |
| WP-M14-69  | ntfy as an optional Compose profile (ADR-0024)                         | done    | yes     |
| WP-M14-70  | setup script for the ntfy access control list and token (ADR-0024)    | done    | yes     |
| WP-M14-71  | Cloudflare Tunnel profile for ntfy (ADR-0024)                          | done    | yes     |
| WP-M14-72  | random ntfy topic per user and backup of the ntfy volume (ADR-0024)    | done    | yes     |
| WP-M14-72b | the subscription QR shows the stored ntfy topic (follow-up of 72)       | done    | yes     |
| WP-M14-73  | the phase-14 record is closed (the stale status fields, the roadmap)     | done    | yes     |
| WP-M14-74  | the tunnel token does not stop the core stack (the Docker smoke test)    | done    | yes     |
| WP-M14-75  | the tunnel dependency is a valid compose schema (the Docker smoke test)  | done    | yes     |
| WP-M14-76  | the office work-order route accepts the free text (out of band)          | done    | yes     |
| WP-M14-77  | the ticket view names the reason of a failed action (out of band)       | done    | yes     |
| WP-M14-78  | the offered stages come from the transition table (out of band)         | done    | yes     |
| WP-M14-79  | the offer and assign actions — spec, ADR-0026 and the split (out of band)  | done    | yes     |
| WP-M14-80  | the offer and assign actions in the database (0043, 0044) (out of band)    | done    | yes     |
| WP-M14-81  | the shared contracts of the offer and assign actions (out of band)         | done    | yes     |
| WP-M14-82  | the engine offers and assigns a ticket (out of band)                      | done    | yes     |
| WP-M14-82b | the offer names the responsible person and the technicians are notified     | done    | yes     |
| WP-M14-83  | the configuration service knows the target of an action (out of band)      | done    | yes     |
| WP-M14-84  | the administration offers and assigns (out of band)                        | done    | yes     |
| WP-M14-85  | the ticket view names the assignees (out of band)                          | done    | yes     |
| WP-M14-85b | the ticket view test proves the assignees (split child of 85)              | done    | yes     |
| WP-M14-86  | the acknowledge result is a selection (follow-up of 78)                    | done    | yes     |
| WP-M14-87  | the readiness calendar names state, technician and pool (out of band)   | done    | yes     |
| WP-M14-88  | the notify action selects a recipient and an ntfy priority (out of band) | done    | yes     |
| WP-M14-89  | the notify engine delivers to the selected recipient (out of band)       | done    | yes     |
| WP-M14-90  | the administration selects the notify recipient and priority (out of band) | done    | yes     |
| WP-M14-91  | the first escalation stage fires when a ticket is created (out of band)  | done    | yes     |
| WP-M14-92  | the first escalation stage is never deleted (out of band)                | done    | yes     |
| WP-M14-93a | the note action carries no key (split child of 93, out of band)          | done    | yes     |
| WP-M14-93b | the note action writes a ticket comment (split child of 93, out of band)  | done    | yes     |
| WP-M14-93c | the tests and the spec prove the note action (split child of 93, out of band) | done    | yes     |
| WP-M14-94  | the time sequence of a rule gets its own frame (out of band)            | done    | yes     |
| WP-M14-94b | the module map names the frame of the time sequence (split child of 94)  | done    | yes     |
| WP-M14-95  | the module map names the escalation changes of phase 14 (out of band)    | done    | yes     |
| WP-M14-96  | the API tests follow the numbered rules (out of band)                    | done    | yes     |
| WP-M14-97  | the remaining API tests follow the numbered rules (out of band)          | done    | yes     |
| WP-M14-98  | the contract knows the numbered keys (out of band)                      | done    | yes     |
| WP-M14-99  | the migration numbers the rules and their actions (out of band)         | done    | yes     |
| WP-M14-99b | the test of the numbering migration (split child of 99, out of band)   | done    | yes     |
| WP-M14-100 | the service derives the keys (out of band)                             | done    | yes     |
| WP-M14-101 | the administration numbers the rules (out of band)                       | done    | yes     |
| WP-M14-102 | the action editor numbers the actions (out of band)                      | done    | yes     |
| WP-M14-103 | the spec and the module map name the taxonomy (out of band)              | done    | yes     |
| WP-M14-104 | the shared test follows the numbered defaults (out of band)              | done    | yes     |
| WP-M14-105 | a chain has one first stage (out of band)                               | done    | yes     |
| WP-M14-106 | the service protects only the first stage (out of band)                  | done    | yes     |
| WP-M14-107 | the administration protects the first stage only (out of band)          | done    | yes     |
| WP-M14-108 | the spec names the single first stage (out of band)                     | done    | yes     |
| WP-M14-109 | the action editor deletes a chosen action (out of band)                   | done    | yes     |
| WP-M14-110 | the rule form shows no number (out of band)                          | done    | yes     |
| WP-M14-111 | the action editor shows the number as a label (out of band)            | done    | yes     |
| WP-M14-112 | the condition builder shows the mode below the conditions (out of band) | done   | yes     |
| WP-M14-113 | the shared contract knows the clock of a stage (out of band)            | done    | yes     |
| WP-M14-114 | the engine and the service use the clock of a stage (out of band)      | done    | yes     |
| WP-M14-115 | the API tests follow the chain of the defaults (out of band)         | done    | yes     |
| WP-M14-116 | the shared contract knows the stage NEW (out of band)                  | done    | yes     |
| WP-M14-117 | the migration adds the stage NEW (out of band)                         | done    | yes     |
| WP-M14-118 | the spec and the module map name the stage NEW (out of band)         | done    | yes     |
| WP-M14-119 | channel repair UI — the translated `lastError` and the own-topic test (out of band) | done | yes |
| WP-M14-120 | the internal notification inbox — spec and split (out of band)         | done    | yes     |
| WP-M14-120a | the database and the contracts of the notification messages (out of band) | done | yes |
| WP-M14-120b | the delivery layer records every personal message (out of band)      | done    | yes     |
| WP-M14-120c | the API of the notification inbox (out of band)                       | done    | yes     |
| WP-M14-120d | the inbox page (out of band)                                          | done    | yes     |
| WP-M14-120e | the bell in the shell with the unread count (out of band)             | done    | yes     |
| WP-M14-121 | the test of the own topic needs a route of the own user (out of band) | planned | yes |
| WP-M14-122 | the bell opens the messages of the inbox (out of band)              | done    | yes     |
| WP-M14-123 | the ntfy setup guide names the topic-prefix ACL (out of band)       | done    | yes     |
| WP-M14-124 | the web-push subscription endpoint (out of band)                    | done    | yes     |


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

**Deploy safety, out of band (WP-M3-17).** The API applies migrations in its container
start, so a broken migration hits the product database and an image rollback does not undo
it. `docker-compose.yml` gained the one-shot `db-backup-pre-migrate` service (no profile):
it writes and verifies `/backups/pre-migrate-<stamp>.sql.gz` into the backup volume, and
`api` depends on it with `condition: service_completed_successfully`, so a failed dump
stops the deployment before any migration runs. `BACKUP_RETENTION_DAYS` also bounds these
dumps; the periodic `backup` profile is unchanged. Phase 3 is reopened only for this safety
item and closes with it.

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
for a build that never comes back. **Record.** WP-M3-05 was first committed as one
package (b551259, check v0.1.130 green). During implementation it exceeded the four
`files-write` entries of §17, so it was split into **WP-M3-05** (shared error code,
spec and labels) and **WP-M3-06** (the deadline in the agent); the superseded single
document was removed (fb0197d). All check runs v0.1.130 … v0.1.134 are green.

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

**The update control is replaced (WP-M3-07 … WP-M3-12, ADR-0007).** The host update agent
of ADR-0006 needed a second, privileged container next to the application — the Docker
socket of the host, `git` and the Docker CLI in the image, a state volume and a start
command whose path differs per deployment panel. The operator already runs a deployment
tool, so the application only has to know *that* a newer commit exists and *that* the
operator wants it. **WP-M3-07** writes the contract (`specs/18-self-update.md` §18.1–§18.7)
and the decision (ADR-0007; ADR-0006 is superseded) and adds the read-only client of the
GitHub API. **WP-M3-08** adds `GET /api/v1/admin/update/check` and
`POST /api/v1/admin/update/start` — the check answers the installed version, the newest
commit of the branch and the commits behind it (cached for a minute), the start checks
again on the server, calls the deploy webhook with the header `X-Deploy-Token` and
answers `202 { started: true }` immediately. **WP-M3-09** gives the image the build
argument `GIT_COMMIT` and the tracked `VERSION` file and the compose file the keys of
§18.5 plus `host.docker.internal:host-gateway`. **WP-M3-10** makes the version badge of
the shell header the entry point of the update menu (the page `/admin/update` is gone).
**WP-M3-11** retires the agent: the workspace `apps/agent`, the compose service
`update-agent`, the `agent` target of the `Dockerfile`, the keys `UPDATE_AGENT_*` and the
volume `update-state` are gone; `scripts/update.sh` stays the manual path of the
operator. **WP-M3-12** documents the new control.

**The update menu tells the failures apart (WP-M3-14).** The deployment replaces the API container, so
the connection of the start request can die before the answer arrives — that is the normal case of a
fast deployment. The menu names that case separately from a refused webhook and offers a reload of
the page; a webhook target must answer immediately and deploy in the background.

**The router shows a page of the application (WP-M3-13).** The retired page `/admin/update` is
a dead address, and every other unknown address ended in the developer page of React Router
("Unexpected Application Error! 404 Not Found"). **WP-M3-13** adds a not found page, an error
element for the router and a catch-all route; the retired address leads to the administration
home, so an old bookmark lands somewhere useful.

**Phase 5 is split and started (the `m5` packages).** Phase 4 closed with WP-M4-01 and left
no open follow-up, so the next roadmap step is phase 5 (offline internal actions). It had nowork packages — `specs/09-offline.md` §9.6 only named the topic — so the split required by
`PLAN.md` §16 happened first: **WP-M5-01 … WP-M5-09** in `work-packages/m5/`, implemented in
numeric order (01 outbox table → 02 receipts table → 03 idempotent helper → 04 routes →
05 queue UI → 06 conflict UI → 07 offline reads → 08 E2E exit criterion → 09 cache clear on
sign-out). **WP-M5-01 … WP-M5-09 are implemented** (Dexie v2 `internal_actions` queue,
receipts table, idempotent helper, action routes, queue UI, conflict UI, offline reads, the
E2E exit criterion and the cache clear on sign-out). Phase 5 is closed. Claiming from the
pool and confirm/decline of shifts stay out of phase 5 (online-only rule of §9.6,
on-call is phase 8).

**The klarmname columns (WP-M2-93, out-of-band phase 2).** Every user gets a sortable
name: `users.given_name` and `users.family_name` (text, `NOT NULL`, default `''`, length
≤ 64, stored trimmed) behind migration `0018_user_klarmname`, with `users_name_idx` over
`lower(family_name), lower(given_name)` and the helper `derive_user_family_name()`, which
fills the already existing rows from the e-mail local part. The bootstrap seed derives the
same family name in `seed-base.ts` and never invents a given name; `email` stays the login
key. The names are not in the shared user schemas and not in the admin user API yet — that
is the announced follow-up **WP-M2-94** (`work-packages/m2/94-user-name-fields-api.md`,
planned).

**Phase 8 is complete (the `m8` packages).** Phase 7 is complete, so the
roadmap moved to phase 8 (on-call calendar). The phase had no work packages and
`specs/04-oncall.md` was still a placeholder, so the split required by `PLAN.md` §16
happened first: **WP-M8-01** filled the slice, resolved the open swap-approval decision
with ADR-0011 (approval defaults to `true`, local wall-clock weeks, group-based pool
membership, default pool by setting, stateless iCal token) and named **WP-M8-02 …
WP-M8-16** in numeric order (tables → DST slot math → pools → planning → routes →
confirm/decline → swaps → ticket coupling → offer timeout → iCal → admin and my-shifts
UI → offline shift actions → exit criterion). Every package is implemented. The
phase-8 exit criterion "DST tests and atomic swap tests pass" is proven by
**WP-M8-16**: the exit test asserts 167/169/168-hour weeks in `Europe/Berlin` and that
exactly one of two concurrent swap acceptances wins, with the losing request answered
`409`.

**Phase 9 is split and started (the `m9` packages).** Phase 8 is complete, so the
roadmap moves to phase 9 (dashboard and statistics). The phase had no work packages and
`specs/11-dashboard.md` and `specs/12-stats.md` were placeholders, so the split
required by `PLAN.md` §16 happened first: **WP-M9-01** fills both slices, resolves the
open phase-9 decisions with ADR-0012 (SSE over a five-second polling probe, plain SQL
views instead of materialized views, a computed fault-free record, a stored rotatable TV
token, `tickets.is_test`, inline SVG charts, `stats.conspicuous_threshold`) and names
**WP-M9-02 … WP-M9-18** in numeric order (test flag → SQL views → shared contracts →
dashboard service → dashboard route → SSE → dashboard settings → TV route → statistics
services → statistics routes → CSV export → web dashboard → web statistics page → web TV
page → web dashboard settings → exit criterion). **WP-M9-02** adds the `tickets.is_test`
column, default false, and the partial counter index over `reported_at` where false; the
packages are implemented in numeric order.

**Out-of-band phase 9 — the office view of the shipped app (WP-M9-19 … WP-M9-22).** The
office asked for a leaner dashboard and a denser ticket list. This work does not wait for
the phase-9 chain, because it changes the product the users see today and not a contract
of a later package. **WP-M9-19** removes the "Brennt jetzt" list from the start page — the
wall display keeps it (`specs/11-dashboard.md` §11.5) — and makes every tile one link over
its whole area. **WP-M9-20** orders the ticket list by the deadline, the open tickets
first and the finished ones behind them, and **WP-M9-21** renders one line per ticket with
the mini timeline in the middle and the whole line as a link to the ticket. The files of
the three packages exist since the commit of WP-M9-19. **WP-M9-22** moves the milestone
markers of the ticket timeline onto the bar: the report marker is a whole dot on the
start point of the axis instead of a half dot above it, and the tooltip names the
milestone in the language of the interface.

**Out-of-band phase 9 — the title switch of the office (WP-M9-23 … WP-M9-25).** The office
asked that the menu entry "Titel bei Ticket erfassen" have a complete effect: a new ticket
carries a title only while the switch is on, and the ticket view shows a title only while
the switch is on. **WP-M9-23** gives the flag one reading point
(`apps/api/src/settings/branding-state.ts`) instead of four copies of the same rule.
**WP-M9-24** answers `title: null` in the ticket view while the switch is off and offers
`GET /api/v1/settings/title-switch` (guarded by `ticket.create`); **WP-M9-25** renders the
title field of the internal creation form only while the switch is on. All three are done.

**Out-of-band phase 9 — the record gap (WP-M9-26).** The commit `d1e34eb`
(`feat(web): object list facelift`) landed with the title switch chain without a work
package and without a WP id in its subject. **WP-M9-26** is the retroactive record of that
commit: the object list rows lost the "extern gepflegt" badge of WP-M2-39 and the `Typ`
column of WP-M2-66 (header, cells and the `externalTypeCategory` import left the DOM
together), the edit and the delete action became a flex row side by side, the keys
`list.externalBadge`, `list.externalHint` and `list.columns.type` were deleted in `de` and
`en` and the page test was rewritten for the leaner row. The data contract is untouched:
the API still answers `externalId` and `externalType`, the BMAcloud sync still writes them
and the object detail keeps the external information. The same record corrects the
off-by-one WP references in the `branding-state.ts` module comment (the internal creation
gate is WP-M9-25, the ticket view gate WP-M9-24) — that comment was the only place in the
repository that ever named WP-M9-26.

**Dashboard evaluations (WP-M10-19, out of band in phase 10).** The office asked
to enrich the dashboard with evaluations — average durations such as the
bearbeitung time — while the worst reaction time stays out: it is neither
calculated nor displayed. **WP-M10-19** adds the `evaluations` block of
`specs/11-dashboard.md` §11.4a to the shared snapshot contract and one
`AVG`-only aggregate query to `apps/api/src/dashboard/service.ts`
(`resolveDashboardEvaluations`: the three §12.2 phases and
`averageProcessingMinutes` as `closed_at - reported_at` over the last 30 days of
the counter's qualifying set; no median, no p90, no max — ADR-0015). The
statistics API and page keep their p90 columns; `specs/12-stats.md` §12.10 names
the block as the only allowed addition. Its follow-up **WP-M10-19b** renders the
block on the start page below the tiles: one labelled line per average, whole
minutes, `keine Daten` for a `null` average, the window count in the panel
header, the labels under `dashboard.evaluations.*` in `de` and `en`, and no
max/p90/median line anywhere — the worst reaction time is not part of the page.

## Validation
**The comment of the office (WP-M5-17, WP-M5-18, out of band in phase 5).** The
office asked for three things on the ticket detail page: a saved comment must be
visible at once, the save must warn that the comment can no longer be corrected,
and the comment field should have a spell check. **WP-M5-17** fixes the first
one: the detail of a ticket is served from the `internal-tickets` cache with
`StaleWhileRevalidate` (WP-M5-07), so the refetch after a write answered with
the copy from before the write and the comment stayed invisible until the next
reload. A write to a ticket now drops that copy — the service worker owns the
cache, so the invalidation belongs to the service worker
(`apps/web/src/sw.ts`, `isInternalTicketWrite`, `invalidateCachedTicket`).
**WP-M5-18** adds the warning: clicking "Kommentar speichern" opens a dialog
that names the append-only rule of `PLAN.md` §6.1, shows the text again and
offers "Speichern" and "Abbrechen"; the write runs only after the
confirmation. The spell check is the one of the browser — the field carries the
interface language and `spellCheck`, so it works offline and ships no extra
download.


```bash
npm run wp:check
```

The check enforces the small-model limits for WPs with `format: small-model`:
max. 120 lines, max. 4 written source files, max. 6 read source files, context
budget max. 30k tokens, required metadata and sections. Legacy WPs are reported
and skipped until they are migrated.
