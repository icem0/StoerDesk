# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- The module map names the escalation changes of phase 14 (WP-M14-95, out of
  band in phase 14): the rows of the configuration service, the dispatcher, the
  action editor and the escalation page name the recipient and the priority of
  a `notify` action, the comment and the internal key of a `history` action and
  the immediate, protected first stage.
- The time sequence of a rule gets its own frame (WP-M14-94, out of band in
  phase 14): the stage tab shows the key of a stage before its names and its
  predecessor, and the rule form groups the start event, the percent and the
  minutes per priority into the frame "Zeitliche Abfolge" above the condition
  and the actions.
- The note action carries no key and writes a ticket comment (WP-M14-93a …
  WP-M14-93c, out of band in phase 14): the key of a `history` action is
  optional in the contract, the server names it (`note_…`), the administration
  hides the key field of a note action and sends no key, and a fired note
  writes a normal `comment` event with its configured text and the actor
  `system`. The audit trail of the workflow E2E counts the escalation event of
  the first stage (WP-M14-91).

### Added
- The first escalation stage is never deleted (WP-M14-92, out of band in phase
  14): the stage writer rejects a body that omits the stage without predecessor
  or gives it one, and the stage tab hides its remove action and locks its
  predecessor select.
- The first escalation stage fires when a ticket is created (WP-M14-91, out of
  band in phase 14): the rules of the stage without predecessor are due at
  `received_at`, independent of their reference and minutes, and the report form,
  the internal form and the external API evaluate the ticket right after the
  transaction. Conditions still apply; an open pause suppresses the firing.
- The administration selects the notify recipient and priority (WP-M14-90, out
  of band in phase 14): the action editor of the escalation page loads the users
  over `GET /api/v1/users` and offers a recipient kind (`user`, `pool`), the
  matching target list and the five ntfy levels. A selected target hides the
  channel multi-select and saves `channels: ['ntfy']`; the empty target keeps the
  channel broadcast. The labels live under `admin.escalation.action.*` in `de`
  and `en`.
- The notify engine delivers to the selected recipient (WP-M14-89, out of band
  in phase 14): a targeted `notify` action resolves the one user or the
  technicians of the readiness pool and queues one `ticket.escalated` outbox row
  per own ntfy topic; without a target the channel broadcast stays. The selected
  level travels as `ntfyPriority` through `messageOf()` and wins in
  `sendNtfyNotification()` over the ticket default.
- The notify action selects a recipient and an ntfy priority (WP-M14-88, out of
  band in phase 14, `specs/07-escalation.md` §7.5): `escalationNotifyTargetSchema`
  names one user or one readiness pool as the recipient, and the five ntfy levels
  `min`, `low`, `default`, `high` and `urgent` are selectable (`NTFY_PRIORITY_NUMBERS`).
  A notify action stays valid with `channels` alone, so old configurations keep
  working; a target alone is valid as well and replaces the channel broadcast. The
  configuration service writes `target` and `priority` into the action jsonb and
  answers `400 invalid_target` when the user or pool does not exist.
- The ticket view test proves the assignees (WP-M14-85b, the split child of
  WP-M14-85, out of band in phase 14, ADR-0026): the new detail page test
  `apps/web/src/features/tickets/__tests__/ticket-detail-assignees.test.tsx`
  renders the ticket detail page with a mocked answer that carries two assignees
  — the view names both technicians — and with an empty `assignees` list — no
  assignee row appears; the row never carries a contact value.
- The ticket view names the assignees (WP-M14-85, out of band in phase 14,
  ADR-0026): the answer of `GET /api/v1/tickets/:ticketNo` carries `assignees` —
  the rows of `ticket_assignees` with the name of their user (`id` and `name`
  only, never a contact value), an empty list for a ticket that was never
  distributed (`packages/shared/src/schemas/ticket.ts`, `apps/api/src/tickets/detail.ts`).
  The ticket view `apps/web/src/features/tickets/ticket-detail-page.tsx` shows
  the technicians below the status under the label `detail.assignees.title`
  (`Zuweisen` in `de`, `assigned technicians` in `en`); a ticket without
  assignees shows nothing. The split child WP-M14-85b carries the page test.
- The administration offers and assigns (WP-M14-84, out of band in phase 14,
  ADR-0026): the escalation page reads the readiness pools over
  `GET /api/v1/oncall/pools` and the user groups over `GET /api/v1/groups` and
  passes them into the action editor; the type select of the editor offers
  `offer` and `assign` and both render a kind select (`pool` or `group`) and a
  target select over the pools or the groups of that kind — a pool or a group
  without a name is not offered. `shapeOf` and `actionOf` carry the target and
  an action without a target is rejected by the shared schema, so it is never
  saved. The labels `admin.escalation.action.types.offer`,
  `admin.escalation.action.types.assign`, `admin.escalation.action.target`,
  `admin.escalation.action.targetKind`, `admin.escalation.action.targetKinds.*`
  and `admin.escalation.action.targetEmpty` exist in `de` and `en`. The page
  test proves the pool offer, the group assignment with its kind select and the
  offer without a target.
- The configuration service knows the target of an action (WP-M14-83, out of
  band in phase 14, ADR-0026): `actionConfig()` of
  `apps/api/src/escalation/config.ts` writes the target of an `offer` or an
  `assign` action into the `config` jsonb, so `GET /api/v1/escalation/config`
  answers it again; the service checks the id against `oncall_pools`
  (kind `pool`) and `groups` (kind `group`) and answers `400 invalid_target`
  with the field paths, because the jsonb carries no foreign key. The config
  spec proves the round trip of a pool and a group target and the two unknown
  targets.
- The readiness calendar names the state and the pool of every shift (WP-M14-87,
  out of band in phase 14, requested by the office): the row of a shift in a day
  cell of `apps/web/src/features/oncall/readiness-calendar.tsx` showed only its
  technician or `oncall.readiness.unassigned` ("nicht besetzt") — WP-M10-41 had
  moved the state and the pool of that shift into the cell's `title` and into a
  screen-reader span, against WP-M10-33 and against the promise of
  `docs/REPO-MAP.md`. The row now names its state label (`oncall.admin.state.*`),
  its technician or `oncall.readiness.unassigned` and its pool name in visible
  text beside the coloured dot; the day cell may grow (`min-h-20`) and the `title`
  carries the same three labels. The legend, the colour of the day and the on-call
  API stay unchanged, no i18n key is added. The calendar test gains the case of an
  unstaffed `PLANNED` shift.
- The offer names the responsible person and the distribution notifies the
  technicians (WP-M14-82b, the split child of WP-M14-82, out of band in phase
  14, ADR-0026): the `offered` step of `apps/api/src/tickets/workflow.ts` takes
  `offered_to_user_id` and `offer_escalated_at` from the payload, so an
  escalated offer names the on-call person of the pool and sets the offer
  timeout (`oncall.escalate_to_group_after_min`) in the transaction of the
  transition — an unstaffed pool and a group target offer without a person and
  without a timeout. `apps/api/src/notifications/receivers.ts` gains
  `ntfyTopicsOfUsers(database, eventType, userIds)`, and
  `apps/api/src/escalation/distribution.ts` queues one outbox row per
  technician with an ntfy account and a selection (`ticket.escalated` for an
  offer, `ticket.assigned` for an assignment) on the own topic of the
  technician. The integration spec proves the staffed offer, the unstaffed
  offer and the broadcast rows.
- The engine offers and assigns a ticket (WP-M14-82, out of band in phase 14,
  ADR-0026): `apps/api/src/oncall/members.ts` (new) extracts the pool members
  rule of `GET /api/v1/oncall/pools/:id/members` (§4a.5) — the members of the
  group of a pool, otherwise every active user holding the `oncall` role — and
  the on-call members route now shares it. `apps/api/src/escalation/distribution.ts`
  (new) performs the `offered` or `assigned` step of `ticket_transitions`
  through `transitionTicket()` (actor `system`), writes one row of
  `ticket_assignees` per technician of the target for an assignment and appends
  one `escalation_note` event `{ rule, stage, target }`; without a step of the
  transition table or without a technician the action changes nothing. The
  dispatcher `apps/api/src/escalation/actions.ts` runs the two new action types
  with the target from the action `config` and counts `offered` and `assigned`.
  The split child WP-M14-82b carries the responsible person of the offer and
  the notification of the technicians. The new integration spec proves the four
  cases on a throwaway database.
- The shared contracts of the offer and assign actions (WP-M14-81, out of band in
  phase 14, ADR-0026): `ESCALATION_ACTION_TYPES` in
  `packages/shared/src/schemas/escalation-config.ts` carries the two new types
  `offer` and `assign` beside `notify`, `webhook`, `history` and
  `status_change`, and the new union `escalationTargetSchema` describes the
  target of a distribution — `{ kind: 'pool' | 'group', id }`, a readiness pool
  of the on-call calendar or a user group of the administration. Both action
  variants of `escalationActionConfigSchema` carry the target next to their
  condition; a target without a kind, with an unknown kind, without an id or
  with a malformed id is rejected. The unit test of
  `packages/shared/src/__tests__/escalation-config.test.ts` proves the two
  variants and the four rejections.
- The offer and assign actions in the database (WP-M14-80, out of band in phase 14,
  ADR-0026): migration `0043_escalation_action_offer_assign.sql` drops the CHECK
  `escalation_actions_type_check` and recreates it with the two new action types
  `offer` and `assign` — the same widening as WP-M14-40, without touching a row
  of an installed database. The target of such an action lives in the `config`
  jsonb (`{ target: { kind, id } }`): a readiness pool of the on-call calendar or
  a user group of the administration, so no column is added. Migration
  `0044_ticket_assignees.sql` adds the table `ticket_assignees` — the
  many-to-many of the technicians a ticket is assigned to, with `ticket_id` and
  `user_id` as foreign keys (`ON DELETE cascade`), the primary key over
  `(ticket_id, user_id)` and the index over `user_id`
  (`specs/02-data-model.md` §4.13). `apps/api/src/db/schema.ts` mirrors the CHECK
  and the new table, the journal reaches `0044`.
- The escalation may offer and assign a ticket (WP-M14-79, out of band in phase 14,
  requested by the office; spec and decision, no product code): ADR-0026 decides
  that a rule of the escalation configuration carries two more action types
  besides `notify`, `webhook`, `history` and `status_change` — `offer` and
  `assign`. Both carry a `target` (`{ kind: 'pool' | 'group', id }`): a readiness
  pool of the on-call calendar or a user group of the administration. The
  technicians of the target are its active members; the offer performs the
  `offered` step of the transition table and names the on-call person of the pool
  in `offered_to_user_id`, the assignment performs the `assigned` step and
  records the technicians in the new table `ticket_assignees`
  (`specs/02-data-model.md` §4.13). Every technician of the target is notified on
  their own ntfy topic for the event type of `ticket.escalated` (the offer) and
  `ticket.assigned` (the assignment); the other channels of the instance reach
  the office and stay the business of the `notify` action. `specs/07-escalation.md`
  §7.5 gains the two rows, the new §7.14 describes the target, the effect and
  the notification, and §7.12 replaces the boundary „no action changes an
  assignment". The children follow in numeric order: WP-M14-80 (the database),
  WP-M14-81 (the shared contracts), WP-M14-82 (the engine), WP-M14-83 (the
  configuration service), WP-M14-84 (the administration) and WP-M14-85 (the
  assignees in the ticket view).
- The subscription QR of the own channels page shows the stored ntfy topic (WP-M14-72b,
  the announced follow-up of WP-M14-72, phase 14 closed, ADR-0024 point 6):
  `GET /api/v1/notifications/accounts/ntfy` in
  `apps/api/src/notifications/routes.ts` builds the subscription address and the
  `ntfy://<host>/<topic>` deep link from the stored `external_id` of the ntfy
  account of the session user — a drizzle-bound select over `notificationAccounts`
  keyed by the session user id and the `ntfy` channel — so the QR points at the
  topic `ntfyRecipients` publishes to. A user without an ntfy account is
  provisioned through `storeAccount` with a fresh random topic from `newNtfyTopic()`
  (visiting the QR connects the user, the server creates the topic); a repeat visit
  keeps the stored topic and writes nothing. An unconfigured ntfy server still
  answers the empty subscription, the session guard and the deep-link derivation
  (WP-M14-33) are unchanged. No migration or rotation of existing topics, no change
  of the adapters, the outbox or `receivers.ts`, no new route, permission key or
  schema. The extended `apps/api/src/notifications/__tests__/routes.unit.spec.ts`
  proves the stored topic, the provisioning of a `stoerdesk-`-prefixed 128-bit
  random topic and the stable topic over two visits.
- The subscription topic of an ntfy user is a random secret of the server and the
  `ntfy` volume joins the backup profile (WP-M14-72, phase 14 closed, ADR-0024 point
  6 and consequences): `apps/api/src/notifications/accounts.ts` exports
  `newNtfyTopic()` — `stoerdesk-` plus 16 random bytes as hex (128 bits, `node:crypto`,
  matching the `stoerdesk-*` ACL entry the setup script of WP-M14-70 creates) — and
  `storeAccount` replaces an empty `externalId` of an ntfy account with that topic,
  so the server creates the topic of a connecting user and the client never picks
  it. `ntfyRecipients` in `apps/api/src/notifications/receivers.ts` answers the
  **stored** topics of the users who selected ntfy only: the `stoerdesk-<userId>`
  fallback is removed and a user without an ntfy account receives no ntfy message
  (`userTopic` stays exported for the internal paths of `outbox.ts`, where the
  creator's own row still falls back to the derived topic). An account whose topic
  was derived from the user id keeps working until the user re-scans the QR and
  reconnects with a random topic — the server never rewrites topics; the number of
  such accounts is a SQL count over the instance database
  (`SELECT COUNT(*) FROM notification_accounts WHERE channel = 'ntfy' AND external_id
  = ('stoerdesk-' || user_id::text)`), unverified here because the development
  container has no instance database. `docker-compose.yml`, the `backup` service: the
  named volume `ntfydata` is mounted read-only at `/data/ntfy` and archived into
  `stoerdesk-<stamp>-ntfy.tar.gz`, so the ntfy user database and its access control
  list travel with the instance; ntfy stores the API token hashed, so the archive
  carries no plaintext token. New `apps/api/src/notifications/__tests__/receivers.unit.spec.ts`
  proves the prefix, the 128 random bits, the missing topic of a user without an
  account and the deduplication; the fixtures of `outbox.unit.spec.ts` and the
  phase-14 exit criterion `phase14-exit.integration.spec.ts` reconnect their user B
  with a stored random topic instead of a derived one. No migration of topics, no
  change of the ntfy adapter (ADR-0022 token handling stays) and no change of the
  subscription route. `docker compose config` is **unverified** — this development
  container has no Docker CLI or daemon; the compose file was checked to parse as
  YAML with the new mount and the still-declared `ntfydata` volume.
- The ntfy server of the `ntfy` Compose profile becomes publicly reachable through
  a Cloudflare Tunnel profile `tunnel` (WP-M14-71, out of band in phase 14, ADR-0024
  points 4 and 5): `docker-compose.yml` gained the service `cloudflared` with
  `profiles: [tunnel]`, the pinned image `${CLOUDFLARED_IMAGE:-cloudflare/cloudflared}`,
  the command `tunnel --no-autoupdate run`, the `backend` network, `depends_on: ntfy`
  with `required: false`, the json-file logging of the stack and **no** `ports:` entry
  — the tunnel is the only public path and the ntfy container keeps no host port.
  `TUNNEL_TOKEN` comes from `CLOUDFLARE_TUNNEL_TOKEN`, required with `:?` as the
  `POSTGRES_PASSWORD` line does, so a missing token stops `docker compose config`
  with a clear message rather than starting a silent tunnel. `.env.example` gained
  `CLOUDFLARED_IMAGE` and an empty `CLOUDFLARE_TUNNEL_TOKEN` with the comment that
  the public hostname of the tunnel must point to `http://ntfy:80` (the hostname
  itself, `NTFY_HOSTNAME`, was announced by WP-M14-69). `docs/DEPLOYMENT.md`
  (Notifications) names the ntfy profile as the exception of "StörDesk ships no
  notification servers" (ADR-0024 consequence), documents start, setup script of
  WP-M14-70 and tunnel and states that the tunnel is the only public path. No DNS
  and no tunnel creation through an API: the operator creates the tunnel in the
  Cloudflare dashboard and copies its token; no Cloudflare Access policy. The
  token is a secret of the class of `POSTGRES_PASSWORD`, written only to `.env`
  and never printed. `docker compose --profile ntfy --profile tunnel config` is
  **unverified**: this development container has no Docker daemon, CI runs the
  smoke test instead; locally the compose file and `.env.example` were checked to
  parse (the `yaml` package and Prettier). No change of `ntfy/server.yml`, of a
  service of the core stack or of any code.
- The ntfy access control list and the API token are created by a setup script
  (WP-M14-70, out of band in phase 14, ADR-0024 point 3): `scripts/ntfy-setup.sh`
  (`npm run ntfy:setup`) runs every ntfy command inside the container of the `ntfy`
  Compose profile over `docker compose --profile ntfy exec --no-tty ntfy ntfy …`, so
  the host needs no ntfy CLI. It refuses without a Docker daemon, without `.env`,
  while the ntfy container is not running and while `auth-default-access` is not
  `deny-all` (the script never widens a looser server); it creates the user
  `stoerdesk-api` with role `user` only when `ntfy user list` does not know it, then
  sets `ntfy access stoerdesk-api "stoerdesk-*" read-write` and `ntfy access
  everyone "stoerdesk-*" read-only` — idempotent, a second run changes nothing, and
  the anonymous read entry is what lets a phone subscribe through the QR code without
  a login (ADR-0024 point 6). Only while the `NTFY_TOKEN` line of `.env` is empty it
  runs `ntfy token add stoerdesk-api` and writes the printed `tk_…` value into `.env`
  with a `sed` on that single key: the token is never printed, never logged and a
  non-empty `NTFY_TOKEN` is kept and never shown (the token is a secret of the class
  of `POSTGRES_PASSWORD`). `package.json` gained `npm run ntfy:setup`. The manual
  check on a running profile (403 anonymous publish, 200 with the token, 403
  anonymous read of a foreign topic) is unverified: this development container has
  no Docker daemon. No change of `ntfy/server.yml` (WP-M14-69), of the API or of a
  route.
- The own channels page names the channel administration (WP-M14-54, out of band
  in phase 14, requested by the office): the office asked where the channels behind
  `Settings → Benachrichtigungen` are set — the page reads `GET /v1/admin/channels`
  but only offered a back link to `/settings`, while the administration already
  links to the own page (`admin.channels.verification.personalLink`, WP-M14-48).
  `apps/web/src/settings/notifications-page.tsx` renders one `Link` to
  `/admin/channels` under the header hint with the label `notifications.administration.link`
  (text only, no permission check, no extra fetch) and the ntfy fallback branch
  (no QR because the instance has no target) names the destination as a second
  line with the same link and the hint `notifications.administration.hint`. The two
  i18n keys are added to `de` and `en` of `apps/web/src/i18n/locales/*/common.json`
  (`Kanal-Administration (Administration → Channels)` / `Channel administration
  (Administration → Channels)`); the pages are not merged — the administration keeps
  the secrets, the test send and the minimum channels behind `notification.write`
  (`PLAN.md` §17 layer rule) — and `specs/10-notifications.md` §11.12 records the
  one-page-per-direction cross-link. `apps/web/src/settings/__tests__/notifications-page.test.tsx`
  asserts both links with `href="/admin/channels"` and the translated label. No API,
  route, schema or permission change.
- Escalation rules can speak the time of the day (WP-M14-41, the last layer of the
  configurable-workflow chain): the condition leaf `time_of_day` is added to
  `escalationConditionLeafSchema` in `packages/shared/src/schemas/escalation-config.ts`
  with the operators `in`/`notIn` and the interval value `HH:MM-HH:MM` (a single interval
  or an array of them, `TIME_OF_DAY_INTERVAL_PATTERN`). `evaluateEscalationCondition()`
  evaluates the leaf against the wall clock of `Europe/Berlin` — the instance's display
  timezone of `PLAN.md` §Time, resolved as the open question of the WP — with the helpers
  `wallClockMinutes()`, `minutesOfDay()` (DST-safe via `date-fns-tz`) and
  `timeOfDayIntervalMatches()` in `packages/shared/src/escalation.ts`: the start of an
  interval is included, its end excluded, so `06:00-22:00` and `22:00-06:00` partition the
  day and an interval may cross midnight (`22:00-00:00` covers the night until
  midnight); an interval that names no clock time never matches. `EscalationFacts` gained
  the optional `timeOfDay` fact — the evaluation stays deterministic in tests and falls
  back to the current wall clock when it is absent. `specs/07-escalation.md` §7.4 carries
  the new row and its semantics, the settings namespace gained the label
  `admin.escalation.condition.fields.time_of_day` in `de` and `en` so the field of the
  condition builder stays localized, and `packages/shared/src/__tests__/escalation.test.ts`
  proves the match inside/outside an interval, the midnight transition, the array values,
  an impossible interval and the malformed leaf. No route, database or migration change —
  a condition is stored as `condition_json` and the rule already accepts the new leaf.
- The escalation administration offers the `status_change` action (WP-M14-40c, the third layer of
  the action): `apps/web/src/admin/escalation-page.tsx` reads the statuses with the existing
  administration route `GET /api/v1/admin/statuses` (WP-M14-36, `settings.read`) as a TanStack query
  and passes the **active** status keys into `RuleForm` and on into `EscalationActionEditor`.
  `apps/web/src/admin/escalation-action-editor.tsx` renders the new type with its label and a
  single-select target-status field (`admin.escalation.action.statusTarget`) over those keys; `shapeOf`
  and `actionOf` carry `toStatus` and the client validates the key with `ticketStatusKeySchema` before
  the request, so an existing status key never enters an invalid body and a `status_change` action
  without a target stays unsaved. The labels `admin.escalation.action.types.status_change` ("Status
  change") and `admin.escalation.action.statusTarget` ("Ziel-Status"/"Target status") are added to the
  `settings` namespace in `de` and `en`; `apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx`
  proves the option, the target select over the configured statuses (the inactive status is not offered),
  that the saved body carries `toStatus` and that an action without a target stays unsaved. No API,
  schema or migration change (WP-M14-40, WP-M14-40b).
- The `status_change` escalation action gets its contract and its engine (WP-M14-40b, the second
  layer of the action): `ESCALATION_ACTION_TYPES` gains `status_change` and the discriminated union
  of `packages/shared/src/schemas/escalation-config.ts` gains the variant
  `{ key, type: 'status_change', toStatus, condition }` with `toStatus` bound to `ticketStatusKeySchema`.
  `apps/api/src/escalation/config.ts` maps the action onto the `config` jsonb (`{ toStatus }`) in
  `actionConfig` and `writeEscalationConfig` rejects a target status that names no row of
  `ticket_statuses` with `400 invalid_status_key` and the field path
  `rules.<i>.actions.<j>.toStatus` — the service rule of WP-M14-39, now on the escalation side,
  because the jsonb of WP-M14-40 can carry no foreign key. `apps/api/src/escalation/actions.ts`
  performs the step: a `status_change` action whose condition matches finds the **active** row of
  `ticket_transitions` that leads from the current status of the ticket to the target
  (`readTicketTransitions`), runs it through `transitionTicket()` (`actorKind: 'system'`, the payload
  carries the rule and the stage, never a contact), appends one `escalation_note` event
  `{ rule, stage, from, to }` documenting the change and counts the move in the `statusChanged`
  counter of `EscalationActionResult`; without such a step the action changes nothing (ADR-0025,
  §7.13). The shared unit test of the new variant, the fired-rule case of
  `apps/api/src/escalation/__tests__/actions.integration.spec.ts` (status moved once, the step event
  and the note written, a second scan a no-op) and the `400 invalid_status_key` of
  `config-routes.integration.spec.ts` prove it. WP-M14-40c (the administration UI) was already split
  in the WP-M14-40 commit and stays open; the stale `status: planned` of that WP file is corrected to
  `done` in this commit.
- The `status_change` escalation action becomes legal in the database (WP-M14-40, the database
  layer of the action): the planned package mixed database, contract, engine and UI over the four
  source-file limit of `PLAN.md` §17 and named the taken migration number `0036`
  (`0036_notification_verification.sql`), so it is split in this commit into WP-M14-40 (database),
  WP-M14-40b (the shared contract and the engine) and WP-M14-40c (the administration UI) — the three
  documents exist and run in numeric order. Migration `0042_escalation_action_status_change.sql`
  drops `escalation_actions_type_check` of `0031` and recreates it with the fourth type
  `status_change`, widening the CHECK without touching a row of an installed database;
  `apps/api/src/db/schema.ts` mirrors the CHECK and the journal reaches `0042`. The target status
  stays in the `config` jsonb (`{ toStatus }`) — jsonb cannot carry a foreign key, so WP-M14-40b
  validates it against `ticket_statuses` with the `400 invalid_status_key` rule of WP-M14-39 — and
  `specs/07-escalation.md` §7.5 gains the `status_change` row while §7.12 replaces the boundary
  "the escalation never changes a ticket state": only such an action moves the status, and only
  through a step of the `ticket_transitions` table of WP-M14-38a (ADR-0025).
- The transition administration gets its page (WP-M14-39b, the UI of the transition administration):
  `apps/web/src/admin/transition-page.tsx` renders the `ticket_transitions` table of WP-M14-38a —
  the row identity, the step from `from_status` to `to_status`, the `event_key` and the `active`
  switch — behind `settings.read` at the new client route `/admin/transitions` (behind
  `RequireSession`, listed in the administration group of the settings menu as
  `auth.links.transitions` in de and en). `settings.write` adds the per-row edit and delete buttons
  and the create form: both status keys are bound to `ticketStatusKeySchema` and the event key to
  `ticketTransitionEventKeySchema` client-side before the request of WP-M14-39 is sent, an edit is
  PATCHed onto the `id` of the row and a delete confirms in a dialog. A rejected delete names its
  code (`404 transition_not_found`), a step that duplicates the unique `(from_status, event_key)`
  index of migration `0041` answers `409 transition_duplicate` and a status key that names no row
  of `ticket_statuses` answers `400 invalid_status_key`. ADR-0025 keeps the trade-off of an empty
  workflow visible: without rows the page says that no ticket can change its status any more
  (`admin.transition.emptyNotice`). `apps/web/src/admin/__tests__/transition-page.test.tsx` proves
  the table, both guards, both forms, the confirmation dialog, the two rejects and the notice.
- The transition administration reads, writes, edits and deletes the workflow steps (WP-M14-39,
  the follow-up of WP-M14-38c): `apps/api/src/tickets/transition-service.ts` gains
  `createTicketTransition`, `updateTicketTransition` and `deleteTicketTransition` next to the
  read of WP-M14-38b and the new `apps/api/src/tickets/transition-routes.ts` answers
  `GET`/`POST`/`PATCH`/`DELETE /api/v1/admin/transitions` behind `settings.read`/`settings.write`,
  registered in `apps/api/src/index.ts`. A malformed body answers `400 invalid_request` with the
  field paths (both status keys bound to the format of `ticketStatusKeySchema`, the event key
  to `^[a-z][a-z0-9_]{0,39}$`), a status key that names no row of `ticket_statuses` answers
  `400 invalid_status_key` with its field (the foreign keys of migration `0041` are the
  database backstop of that rule), a `POST` or `PATCH` that would duplicate the unique index
  `(from_status, event_key)` of that migration answers `409 transition_duplicate` with the pair
  and an unknown `id` answers `404 transition_not_found`. The `id` of an existing row stays its
  identity and never enters the body; the administration does not block a delete on a step
  count — ADR-0025 keeps the trade-off of an empty workflow visible in the UI of WP-M14-39b.
  `apps/api/src/tickets/__tests__/transition-management.integration.spec.ts` proves the four
  routes, both format rejections, the create of a new step, the `invalid_status_key` of an
  unknown key, the `transition_duplicate` on `POST` and `PATCH`, the edit of the `active`
  switch and the delete of the added row.
- The workflow engine reads the transition rows (WP-M14-38c, the third child of WP-M14-38):
  `transitionTicket()` in `apps/api/src/tickets/workflow.ts` loads the rows of `ticket_transitions`
  once per call with `readTicketTransitions(database)` and resolves the step of `(current status,
  event)` with `resolveTransition(transitions, fromStatus, event)`; `undefined` throws the existing
  `INVALID_TRANSITION` (409 `invalid_transition` with `from` and `event` in `params`), the UPDATE
  inside the transaction still re-checks `status = <from>` (the atomic acceptance rule of `PLAN.md`
  §12), the workflow columns stay keyed by `event_key` and the new status comes from the `toStatus`
  of the row — the map lookup and its wildcard `TRANSITIONS['*']` are gone, because the migration
  seeds one `cancelled` row per status. `TRANSITIONS` and `TRANSITION_EVENT_KEYS` stay exported only
  as the view of the escalation layer (WP-M14-40 and WP-M14-41 move it onto the table). The new
  `apps/api/src/tickets/__tests__/transition-table.integration.spec.ts` proves on a migrated
  throwaway database that a `NEW` ticket reaches the status the seeded row names, that an event
  without a row answers 409 and leaves the ticket untouched, that a row set to `active = false`
  blocks its step and that an edited `to_status` moves the ticket to the status the row names.
- The transition rows are read and resolved as configuration (WP-M14-38b, the second
  child of WP-M14-38): `packages/shared/src/schemas/ticket.ts` gains the row contract of
  `specs/07-escalation.md` §7.13 — `TicketTransition { id, fromStatus, toStatus, eventKey,
  condition, active }` behind `ticketTransitionSchema` with both statuses bound to the key
  format of `ticketStatusKeySchema`, the event key bound to
  `ticketTransitionEventKeySchema` (`^[a-z][a-z0-9_]{0,39}$`, the form of the events of
  `PLAN.md` §7) and the error code `transition_not_found` — and the new service
  `apps/api/src/tickets/transition-service.ts` exposes `readTicketTransitions(database)`,
  which answers every row of `ticket_transitions` (active and inactive) ordered by
  `from_status` and `event_key`, and the pure `resolveTransition(transitions, fromStatus,
  eventKey)`, which returns the row that performs the step or `undefined` when no **active**
  row does. The rows are loaded once per call, so `transitionTicket()` (WP-M14-38c) resolves
  them there; there is still no create, update or delete function (WP-M14-39), no evaluation
  of `condition` (WP-M14-41) and the engine still reads the code map `TRANSITIONS`.
  `apps/api/src/tickets/__tests__/transition-service.integration.spec.ts` proves on a
  migrated throwaway database the 22 seeded rows in that order, the one `cancelled` row per
  status, `NEW`/`review_started` → `IN_REVIEW`, nothing for `NEW`/`closed` and nothing for a
  row that was set to `active = false`.
- The transition table exists in the database (WP-M14-38a): migration
  `0041_ticket_transitions.sql` creates `ticket_transitions` — `from_status` and
  `to_status` as foreign keys to `ticket_statuses.key` with `ON DELETE cascade`,
  `event_key` unique over `(from_status, event_key)`, the nullable `condition_json`
  (stored, evaluated only from WP-M14-41) and `active` — and seeds it idempotently with
  the 22 steps of `PLAN.md` §7 plus the nine default statuses; `tickets_status_check` of
  migration `0004` is dropped (ADR-0025 decision 5: the status key on a ticket stays
  history), `apps/api/src/db/schema.ts` mirrors the table as `ticketTransitions` and the
  journal reaches `0041`.
- The ticket transitions become configuration (WP-M14-38, documentation only, no product
  code): WP-M14-35 … WP-M14-37 made the statuses rows, but the steps stayed the code map
  `TRANSITIONS` in `apps/api/src/tickets/workflow.ts`, so a status an administrator adds has
  no step into it and none out of it — and the CHECK `tickets_status_check` of migration
  `0004` still limits `tickets.status` to the nine keys. `specs/07-escalation.md` gains
  §7.13: `ticket_transitions` (migration `0041`) carries the steps, `from_status` and
  `to_status` are foreign keys to `ticket_statuses.key` with `ON DELETE cascade`, `event_key`
  is unique per `from_status`, `condition_json` is stored now and evaluated only from
  WP-M14-41, the wildcard `cancelled` becomes one row per status and the 22 steps of
  `PLAN.md` §7 — plus the nine status rows the keys need — are seeded idempotently by the
  migration. ADR-0025 decides the shape and rejects a foreign key from `tickets.status`;
  `PLAN.md` §6, §16 and §19 carry it. The announced package exceeded the four-file limit of
  §17, so it is split into WP-M14-38a (the table, the Drizzle mirror, the journal),
  WP-M14-38b (the shared contract `TicketTransition`, `readTicketTransitions`,
  `resolveTransition`) and WP-M14-38c (`transitionTicket()` reads the table, unknown or
  inactive step answers `409 invalid_transition`); the three documents exist in this commit
  and WP-M14-39 now depends on WP-M14-38c.
  answers `/admin/statuses` — the `ticket_statuses` table of WP-M14-35 with key, the names de/en,
  the colour (a swatch next to the hex), the position, the active and terminal flags and the number
  of tickets that carry each status. `settings.read` reads the table, `settings.write` adds the
  create form and the per-row edit and delete buttons; a delete first asks for confirmation and a
  rejected one names its code (`409 status_in_use`, `409 status_last_active`).
  `apps/web/src/admin/status-form.tsx` (`StatusForm`) creates or edits one status and validates the
  body client-side against `ticketStatusCreateRequestSchema`/`ticketStatusUpdateRequestSchema` before
  the request — the key of an existing status never enters an edit body. The administration group of
  the settings menu (`apps/web/src/settings/settings-page.tsx`) links the page (`auth.links.statuses`
  in de and en), the route sits behind `RequireSession` in `apps/web/src/routes/index.tsx` and
  `apps/web/src/admin/__tests__/status-page.test.tsx` proves the table, the guards, the forms and
  both rejects.
- The ticket status administration API (WP-M14-36, WP-M14-35): the status of a ticket is a
  machine key of the `ticket_statuses` table, so `apps/api/src/tickets/status-service.ts` and
  `status-routes.ts` answer `GET`/`POST`/`PATCH`/`DELETE /api/v1/admin/statuses` behind
  `settings.read`/`settings.write` — the list carries the `de`/`en` names, the color, the
  position, the active switch, the terminal flag and the number of the tickets that carry each
  status (`ticketCount`). A malformed body answers `400 invalid_request` with the field paths,
  a taken key `409 status_key_taken`, an unknown key `404 status_not_found`, a status a ticket
  still carries `409 status_in_use` with its count and the last active status is never switched
  off or deleted (`409 status_last_active`); the key of an existing status is immutable, because
  the workflow, the escalation stages and the tickets reference it. The shared contracts
  `ticketStatusCreateRequestSchema`, `ticketStatusUpdateRequestSchema`,
  `ticketStatusResponseSchema` and `ticketStatusListResponseSchema` arrive in
  `packages/shared/src/schemas/ticket.ts` and `apps/api/src/tickets/__tests__/status-management.integration.spec.ts`
  proves the rules on a throwaway database.
- The ticket status key format (WP-M14-35 repair): the fixed-key CHECK of migration `0034`
  allowed only the nine statuses and thus blocked the configurable statuses it was meant to
  open up. Migration `0040_ticket_status_key_format.sql` drops it and checks the key as an
  upper-case machine key of up to 40 characters (`^[A-Z][A-Z0-9_]{0,39}$`), the rule ADR-0023
  states for stage keys; `apps/api/src/db/schema.ts` carries the same constraint.
- The readiness selection of the technician (WP-M14-32, ADR-0021): the readiness block
  of `/settings/notifications` (`apps/web/src/settings/notifications-page.tsx`) renders
  the three readiness event types of §11.4 as their own rows below the ticket-event
  selection section of WP-M14-17 — one row per readiness event type with one checkbox
  per configured channel of §11.1, a channel that is not configured is not offered
  and a user without a saved readiness row sees "the channels of the instance" (the
  fallback of §11.4). Toggling a readiness checkbox feeds the same shared selection
  state that `PUT /api/v1/notifications/preferences` of WP-M14-16 writes, so saving
  the readiness selection never clears the ticket selection of the user and the
  API, the schema and the migration of WP-M14-16 stay unchanged; the ticket event
  rows of WP-M14-17 stay unchanged as well. The settings namespace keys
  `settings.notifications.events.oncall.assigned` = "Bereitschaft allocation" /
  "Readiness allocation", `oncall.swap_requested` = "Swap request" / "Swap
  requested" and `oncall.unconfirmed_reminder` = "Unconfirmed reminder" /
  "Unconfirmed shift reminder" (de and en) carry the labels of the block;
  `apps/web/src/settings/__tests__/readiness-selection.test.tsx` proves the three
  rows, the checkbox state for a saved readiness row, the instance-channel fallback,
  the missing checkboxes for an unconfigured channel and the PUT body shape.
- The reminder of an unconfirmed readiness (WP-M14-31, ADR-0021): `enqueueOncallReminders(database, env, now)`
  in `apps/api/src/oncall/coupling.ts` queues one `oncall.unconfirmed_reminder`
  outbox row per `DRAFT` or `PLANNED` shift that has a technician, has not started
  and starts within `oncall.reminder_unconfirmed_h` — through `enqueueOncallOutbox`
  of WP-M14-28 in its own transaction, skipped while such a row for that shift is
  already `PENDING` or `SENT`, so the scan sends at most one reminder per shift.
  `apps/api/src/jobs/escalation.ts` runs the sweep after the offer timeout in the
  existing per-minute `ticket-escalation` job and logs only the `remindersQueued`
  counter, never a shift id. `apps/api/src/oncall/__tests__/reminder-notification.integration.spec.ts`
  proves the window, the idempotent second scan, the silent `CONFIRMED` shift, the
  out-of-window shift and the slot without a technician plus the counters of the
  scan result.
- An assigned readiness can be accepted (WP-M14-30, ADR-0021): `CONFIRMABLE_STATES`
  in `apps/api/src/oncall/confirm.ts` now holds `DRAFT` and `PLANNED`, so the
  assigned technician — or an admin — confirms a `DRAFT` readiness into `CONFIRMED`
  with `confirmed_at` and the single append-only `confirmed` `oncall_events` row in
  the same transaction; the decline rule, the `oncall_shift_started` rule and the
  `clientUuid` idempotency stay unchanged. `apps/web/src/features/oncall/my-shifts-page.tsx`
  renders the confirm button for a `DRAFT` shift of the own technician next to `PLANNED`;
  a `DRAFT` shift of another technician still shows no action and the decline and swap
  buttons keep their states. `apps/api/src/oncall/__tests__/confirm.integration.spec.ts`
  proves that a `DRAFT` shift answers `200` with the shift in `CONFIRMED`, that a repeat
  with the same `clientUuid` writes no second event and that a `DECLINED` or `UNFILLED`
  shift still refuses with `409 oncall_invalid_shift_state`.
- ntfy as an optional Compose profile (WP-M14-69, ADR-0024): `docker-compose.yml`
  gains the service `ntfy` with `profiles: [ntfy]`, the image pinned by
  `${NTFY_IMAGE:-binwiederhier/ntfy}`, the command `serve`, `restart:
  unless-stopped`, the json-file logging of the other services and the `backend`
  network without any `ports:` entry, so a deployment that does not select the
  profile starts nothing and the external ntfy path of `NTFY_URL` /
  `NTFY_PUBLIC_URL` keeps working. `ntfy/server.yml` is mounted read-only at
  `/etc/ntfy/server.yml` with the access control list of ADR-0024
  (`auth-file: /var/lib/ntfy/user.db`, `auth-default-access: deny-all`), the
  behind-proxy settings for the Cloudflare Tunnel (`behind-proxy: true`,
  `proxy-forwarded-header: CF-Connecting-IP`) and `base-url: ${NTFY_BASE_URL}`
  substituted by ntfy from the container environment; the named volume `ntfydata`
  holds `/var/lib/ntfy`. `.env.example` gains `NTFY_IMAGE`, `NTFY_BASE_URL` and
  `NTFY_HOSTNAME` next to the empty `NTFY_TOKEN`, which the setup script of
  WP-M14-70 fills; no secret is in a file of the repository. `docker compose
  config` with and without `--profile ntfy` is unverified in the development
  container (no Docker daemon) and proven by the CI Docker smoke test.
- The allocation and a swap request enqueue their rows (WP-M14-29): `createShift`
  and the assign branch of `updateShift` in `apps/api/src/oncall/service.ts`
  enqueue `oncall.assigned` for the technician through `enqueueOncallOutbox` in
  the transaction node the shift write already uses, and `requestSwap` in
  `apps/api/src/oncall/swaps.ts` enqueues `oncall.swap_requested` for the
  requesting technician and for a named target colleague — a request to the whole
  pool notifies only the requester. The rows are written in the transaction of the
  on-call write, never in a channel call (§11.7); `assignedAnnouncementQueued`
  keeps the allocation announcement idempotent: a shift whose `oncall.assigned`
  row is still `PENDING` or already `SENT` queues no second row.
  `apps/api/src/oncall/__tests__/allocation-notifications.integration.spec.ts`
  drives the real routes on a throwaway database and asserts the selected channel
  of a technician who selected one and the instance chain for one who did not.
- ADR-0024 decides that ntfy becomes an optional Compose profile behind a
  Cloudflare Tunnel, with a deny-all access control list, a setup script for the
  API user and token, and random per-user topics. Work packages WP-M14-69 to
  WP-M14-72 are planned; no code has changed yet.
- The outbox and the notification preferences know the readiness (WP-M14-27):
  migration `0039` gives the outbox an `event_type` over the seven ADR-0021
  types, a nullable `shift_id` with the cascade to `oncall_shifts` and a
  nullable `ticket_id`, with the check that exactly one of ticket and shift is
  set; the preferences check widens to the seven types. The drain writes no
  ticket event and queues no ticket fallback for a shift row.
- A readiness row is queued and drained like a ticket row (WP-M14-28): the shared
  contract `oncallShiftMessageSchema` carries pool name, the start and end in
  `Europe/Berlin` formatted from the stored UTC values, the shift state and the
  shift id; `enqueueOncallOutbox` writes one `PENDING` outbox row per selected
  channel of the technician, the instance chain when the technician has no
  selection, and is a no-op while a row for the same shift and event is still
  `PENDING`; the drain branches on `shift_id`, builds the readiness message and
  the `/oncall` deep link, never touches the ticket fields, and reuses the retry,
  backoff and `FAILED` machinery.
- The messenger-channel line of phase 14 is closed by an exit criterion (WP-M14-21): the integration test `apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts` runs the real API on a throwaway database and proves the three rules of the precedence of `specs/10-notifications.md` §11.4 — a stored ntfy account of a user is used for the send, the selection of the user decides the channels of `ticket.created` (one row per selected user, the instance topic replaced, a user without a selection gets none) and the mandatory minimum channels of a critical ticket are queued whatever the selection says —, the warning of §11.8 (a failed channel is visible in `GET /api/v1/notifications/status` with a failure and no pending row and the drain continues to the next channel of the chain) and the secrecy rule of §11.13 (the ntfy access token and the Matrix token travel only in the `Authorization` header, never in an answer, a log, an event payload or a published body). `GET /api/v1/notifications/status`
  answers the pending rows, the failed rows, the time of the last success and the time of the
  last failure per channel — the same rows of the outbox the dashboard tile reads
  (`resolveChannelStatus` of WP-M9-05, the shared contract `channelStatusListResponseSchema`).
  `/admin/channels` lists the failing channels with their last failure and the number of the
  failed rows, and the settings menu of an administrator shows a badge with the number of the
  failing channels as long as a channel fails (`specs/10-notifications.md` §11.8: a warning that
  only lives in a list of a page is not a warning — the tile of the dashboard and the
  `notification_failed` event of the ticket history keep carrying it as before).
- Every notification message links to its ticket (WP-M14-68, out of band in phase 14,
  requested by the office): a sent message now names the ticket it is about. §11.5
  already demanded "the deep link into the ticket", but every channel adapter had
  linked `env.PWA_URL` — the root of the PWA — so a recipient in Telegram or ntfy
  had to find the ticket again by hand. `drainOutbox` now hands
  `ticketDeepLink(env.PWA_URL, target.ticketNo)` (`<pwa-url>/tickets/<ticket-number>`)
  to `NotificationChannel.send` as `deepLink` and the channel registry passes it to
  every adapter: ntfy's `view` action and the `<label>: <url>` deep link of Telegram,
  Matrix, Signal, e-mail, web push and WhatsApp point into the ticket, also on a
  fallback row of the escalation chain. The link carries the ticket number only —
  no `status_token`, no credential, no contact data; the PWA root stays the fallback
  of an older row without a ticket number and of a test message, and the readiness
  link to `/oncall` (ADR-0021) stays with WP-M14-28.
- The escalation stage chain becomes configurable — specification, ADR-0023 and
  the phase split (WP-M14-58, out of band in phase 14, requested by the office;
  documentation only, no product code): the office needs a configurable number of
  escalation stages. `specs/07-escalation.md` gains §7.11: a stage is a row with
  a free `key`, a nullable `predecessor` and a `reached_by` event list,
  `PUT /api/v1/escalation/stages` replaces the whole set (max. 20 stages) in one
  transaction, the chain is validated (unique keys, predecessor exists, no cycle,
  order consistent with `position`), the predecessor carries the clock
  (otherwise from `received_at`) and removing a stage removes its rules through
  the foreign key `escalation_rules.stage_key` with `ON DELETE cascade`. ADR-0023
  supersedes decision 1 of ADR-0017 (the fixed stage count), every other decision
  of ADR-0017 stays. `PLAN.md` §6, §9, §14 and §19 carry the shape. The split is
  WP-M14-59 … WP-M14-67 (database `0037_escalation_stage_chain` → shared
  contracts and the chain validator → seed → replace-all stage-set API → engine
  on the chain → available stages of the ticket view → administration UI and
  texts → page tests → exit criterion); the files exist in this commit.
- The escalation stage chain lives in the database (WP-M14-59): migration
  `0037_escalation_stage_chain` adds `predecessor` and `reached_by` to
  `escalation_stages`, drops the fixed-key CHECKs and turns
  `escalation_rules.stage_key` into a foreign key with `ON DELETE cascade`. The
  installed five-stage chain is backfilled, so a running installation keeps its
  behaviour; the Drizzle schema mirrors the new columns and the cascade.
- The shared contracts of the stage chain are free of the five fixed keys
  (WP-M14-60): `EscalationStageConfig` carries `predecessor` and `reachedBy`,
  the rule and condition keys use the stage key pattern, the new
  `validateEscalationStageChain` names duplicate keys, missing or self
  predecessors, cycles, contradictory positions and unknown reaching events,
  and `escalationStagesBodySchema` accepts up to 20 stages. The default chain
  keeps its five stages as the seed only.
- The seed writes the default chain (WP-M14-61): every stage row of a fresh
  installation carries its predecessor and its reaching events, while an
  existing row stays untouched and the rule seed keeps its matching clocks.
- `PUT /api/v1/escalation/stages` replaces the whole chain (WP-M14-62): the
  service validates it against the transition event keys, upserts the submitted
  stages and deletes the missing ones in one transaction, so their rules cascade
  away while the firing log stays. A rule must name an existing stage and its
  explicit reference must match the clock of that stage; `null` takes the
  stage clock.
- The escalation engine reads the stage chain (WP-M14-63): it loads the active
  stages once per scan, derives the reached stages and the `stageReached`
  facts from `reached_by`, starts the clock of a stage at the latest event of
  its predecessor (or `received_at` without one) and fires a stage rule only
  while its stage is not reached. The hard-coded `STAGE_EVENTS` and
  `WAITING_STATUS_BY_REFERENCE` maps are gone.
- The available stages of the ticket view come from the chain (WP-M14-64): the
  detail answer offers the active stages whose `reached_by` names a transition
  the current status allows, so a newly added stage appears and a removed or
  inactive one does not. The fixed `ESCALATION_REACHABLE_STAGES` and
  `ESCALATION_STAGE_EVENTS` maps are gone.
- The escalation administration edits the chain itself (WP-M14-65): the stage
  tab renders the served stages instead of the five fixed keys, every stage
  offers its predecessor (or no predecessor), an add row creates a stage and a
  remove action names the affected rules before it saves the set without the
  stage. The German and English texts explain the chain and its cascade.
- A stage rule may take the clock of its stage (`reference = null`) on the
  database too (WP-M14-59/WP-M14-62 correction): migration `0038` replaces the
  clock check, and a stage write resets an explicit reference that no longer
  matches the moved predecessor clock instead of leaving the configuration
  unreadable.
- The configurable stage chain has its exit-criterion test (WP-M14-67): an
  intermediate stage is inserted, its rule fires once, the ticket view offers
  only allowed stages, and removing the stage keeps its firing and event rows.
- The stage tab is covered by page tests (WP-M14-66): served stage order,
  predecessor options, the add row, the remove action with its affected rule
  keys and the empty-key guard are asserted in both languages.
- The channel test send and the verification request carry a JSON body (WP-M14-55):
  the administration showed the untranslated Fastify code
  `FST_ERR_CTP_EMPTY_JSON_BODY` — removing the separate ntfy test topic had also
  removed the request body, while the page kept sending
  `content-type: application/json`. Fastify 5 rejects an empty body with that
  content type before the route runs, so neither the test message nor the one-time
  ntfy code reached the API and the target stayed *unverified* without outbox rows.
  Both requests now send `{}`; the routes, their schemas and the saved row as the
  test target (WP-M14-51) stay unchanged.
- The ntfy publish request carries a timeout (WP-M14-53): `fetch` has none by
  default, so an ntfy server that accepts the connection but never answers held
  the drain worker and the admin test send open. The request is aborted after
  ten seconds and ends as the machine code `http_timeout` with a translated
  reason; the three attempts with backoff and the fallback chain stay as they
  are.
- The ntfy administration names the access token (WP-M14-52): `401` and `403`
  now say that the access token of the channel is missing or wrong — a claimed
  topic is only the second cause — the ntfy card warns while an enabled channel
  has no key, and the copied curl command carries
  `-H "Authorization: Bearer $NTFY_TOKEN"` while the row has a secret. The stored
  key itself never enters the command, the clipboard, an answer or a log.
- ntfy counts as configured only after the code came back (WP-M14-47): the
  channel showed "konfiguriert" as soon as a value stood in the row, and the
  sender used the environment instead of the saved row. StörDesk now sends a
  six-character code to the effective ntfy topic, stores its fingerprint and
  accepts it back through `POST /api/v1/admin/channels/ntfy/verification` and
  `…/verification/confirm`. Only a confirmed target appears as configured and
  produces outbox rows; the outbox, the drain, the enqueue and the admin test
  send use the saved configuration. A changed address or topic invalidates the
  proof, and an unverified ntfy channel is skipped in the fallback chain and in
  the mandatory minimum channels.
- The administration confirms the ntfy code (WP-M14-48): the ntfy card explains
  the setup in three steps, shows the subscription QR code and address of the
  saved topic, links to the personal subscription page and offers "Code senden"
  and "Code bestätigen". The state badge reads "ungeprüft" until the code came
  back and "geprüft" afterwards.
- A failed ntfy test send explains itself (WP-M14-49): the adapter reports the
  HTTP status as machine code (e. g. `http_407` when the topic is already
  claimed on ntfy.sh), and the administration shows a translated reason with a
  concrete hint instead of a bare "http_error". The verification code send
  carries the same reason in its answer params.

### Changed
- The record of WP-M14-79 is closed (record correction in phase 14): commit
  `6820920` implemented the spec and decision package of the offer and assign
  actions — `specs/07-escalation.md` §7.5 and §7.14, `specs/02-data-model.md`
  §4.13, ADR-0026 with its index row in `docs/DECISIONS.md` and the children
  WP-M14-80 … WP-M14-85 created in the same commit — and the whole chain
  WP-M14-80 … WP-M14-85b is shipped, but the document still carried `status:
  planned` and the backlog table of `work-packages/README.md` still listed the
  row as `planned`. Both now read `done`, `PLAN.md` §16 names the correction
  and the phase-14 entry of `docs/REPO-MAP.md` carries the out-of-band office
  items WP-M14-76 … WP-M14-87. No product code, schema, route, UI,
  specification or ADR changes.
- The phase-14 record is closed (WP-M14-73): all 80 packages of phase 14 are
  implemented, the two exit criteria of the phase are proven by their
  integration tests (`phase14-exit.integration.spec.ts` of WP-M14-21 and
  `stage-chain-exit.integration.spec.ts` of WP-M14-67) and no follow-up is open.
  The documents WP-M14-23 … WP-M14-26 still carried `status: planned` although
  their packages landed long ago (`604e9d8`, `8e7c9cf`, `4316b58`, `6f8a93b`);
  the field now reads `done`, so the work packages and the backlog table of
  `work-packages/README.md` agree. `PLAN.md` §16 names the phase as closed, the
  phase row of the table of `work-packages/README.md` marks it as closed and the
  implementation status of `docs/REPO-MAP.md` ends with "Phase 14 complete". No
  code, schema, route, UI, specification or ADR changes — the decisions of the
  phase are settled (ADR-0019 … ADR-0025) and `PLAN.md` §19 carries no open
  decision of the phase.

### Fixed
- The acknowledge result is a selection (WP-M14-86, the follow-up of WP-M14-78):
  the acknowledge panel of the ticket view asked the result as a free text input
  whose placeholder listed the four values of the API (`fixed`,
  `partially_fixed`, `follow_up_required`, `no_fault_found`). A typo, a
  translation or a capital letter answered `400 invalid_request`, so the
  acknowledgement failed. The panel offers the four values as a `<select>` now,
  with a label per value (`detail.acknowledgeResult.*`) and the confirm button
  disabled until one is chosen.
- The offered stages come from the transition table (WP-M14-78): the ticket view
  offered a stage whose step the engine rejected (`409 invalid_transition`)
  whenever the administration had edited the rows of `ticket_transitions`,
  because `readReachableStages()` of `apps/api/src/escalation/config.ts` derived
  the allowed events from the code map `TRANSITIONS` while `transitionTicket()`
  read the table — the consequence ADR-0025 announced for WP-M14-40 and
  WP-M14-41. Both views of the escalation layer read the table now: a stage is
  offered while one of its `reached_by` events is an **active** row whose
  `from_status` is the current status, and the stage chain of
  `PUT /api/v1/escalation/stages` names the event keys of the table.
  `TRANSITIONS` and `TRANSITION_EVENT_KEYS` had no reader left and are removed.
- A failed action names its reason (WP-M14-77): the ticket view answered the
  generic "Die Aktion konnte nicht ausgeführt werden." for every failed
  escalation, because `actionErrorMessage()` looks the error code of the API up
  in `detail.errors` and that namespace only knew the codes of the delete —
  `invalid_request`, `invalid_transition`, `ticket_not_found`, `session_invalid`
  and `forbidden` all fell back to the generic text. The five codes have a text
  in `de` and `en` now, and the message of `invalid_transition` names the status
  of the ticket (the label of `status.values.<key>`, the raw key for a status the
  administration added). An unknown code keeps the generic notice.
- The work order of the office is accepted again (WP-M14-76): the stage selection
  of the ticket view sends the free text field of WP-M14-43 (`{ text }`), but the
  office route `POST /api/v1/tickets/:ticketNo/work-order` still validated the
  body against the schema `{ type, number }` of WP-M2-19c — the contract WP-M14-42
  replaced with the free text. Every work order of the office answered
  `400 invalid_request`, and the ticket view answered the generic "Die Aktion
  konnte nicht ausgeführt werden.", because that error code has no translation in
  `detail.errors`. `apps/api/src/tickets/workflow-routes.ts` uses the shared
  `workOrderRequestSchema` now — the same contract as the external route
  (`PATCH /api/v1/tickets/:ticketNo/work-order`) and as `transitionTicket()`, which
  writes `payload.text` into `tickets.work_order_text`. The row of
  `specs/08-objects-api.md` §9.3 names the new body.
- The compose file of the tunnel profile is valid again (WP-M14-75): the long
  syntax of `depends_on` requires the `condition` beside the `required`, and the
  service `cloudflared` carried only `required: false` — `docker compose` rejected
  the file with `services.cloudflared.depends_on.ntfy missing property
  'condition'`. The service now names `condition: service_started`: the ntfy
  server stays optional (the tunnel can start on its own while only the profile
  `tunnel` is enabled) and the file passes the schema of the Compose
  specification. The three other compose files of the repository were valid
  before and stay valid.
- A deployment without a Cloudflare Tunnel starts again (WP-M14-74): the tunnel
  token of the service `cloudflared` was read with the strict
  `${CLOUDFLARE_TUNNEL_TOKEN:?…}`, and `docker compose` interpolates every
  service of the file — also the ones of a profile that is not selected. The
  missing token therefore stopped the config of the **core** stack of every
  deployment without a tunnel (and the Docker smoke test of the CI) with a
  message about a tunnel that was never wanted. `docker-compose.yml` reads the
  token as `${CLOUDFLARE_TUNNEL_TOKEN:-}`: the core stack starts unchanged while
  the token is empty, and the tunnel container of the profile `tunnel` stays
  stopped with the error of `cloudflared` in its log. `npm run ntfy:setup` names
  the state of the key in `.env` (missing, empty or set — never its value)
  before the operator starts the tunnel. The tunnel itself is unchanged
  (image, command, network, `depends_on`, no host port) and the operator
  command `docker compose --profile ntfy --profile tunnel up -d` stays.
- A self-hosted ntfy server that needs an access token now works (WP-M14-51):
  the key saved in the write-only secret field of the channel (and in
  `NTFY_TOKEN`) never reached any send, so the test message and the
  verification code failed with `403`. ADR-0022 makes that secret the access
  token of the server: the test send, the verification code and the outbox
  drain put it into the `Authorization` header of the publish request. The key
  stays out of every answer, log, error text, the subscription address and the
  deep link.
- The own channels page no longer hides the ntfy QR when Telegram is not
  configured (WP-M14-46): the page replaced every section with the Telegram
  error because the code route answered an unhandled `500` without a bot token.
  The route now answers `503 channel_not_configured`, the error is inline in the
  Telegram section, and the ntfy card stays visible — with the subscription
  address as selectable text and the hint that ntfy has to be selected for the
  events.
- The office ticket now notifies as well (WP-M14-20): `POST /api/v1/tickets`
  wrote the ticket and its `created` event but never a notification outbox row,
  so a ticket created in the administration never reached ntfy, Telegram or any
  other channel. The internal creation now enqueues the `ticket.created` rows in
  the same transaction as the ticket — a rollback leaves no outbox row behind.
- The ntfy channel publishes real JSON, not raw text: the adapter sent the JSON
  body to `/{topic}` with the action field `uri` and the string priority
  `default`/`urgent`, so ntfy showed the raw JSON as the message and dropped the
  title and the button. It now publishes to the server root (`POST /`) with the
  topic in the body, the action field `url`, and the numeric priority (`5` for a
  critical ticket, `3` otherwise) — the contract of
  https://docs.ntfy.sh/publish/#publish-as-json. A `view` action with an empty
  PWA URL is invalid and is now omitted instead of being sent. The channel card
  in the administration shows the corrected, copy-pasteable `curl` command.
- ntfy honours the selection of the user (WP-M14-45): the outbox published
  every ticket to the configured instance topic, so a phone that subscribed to
  the topic of the user (`stoerdesk-<userId>`) through the QR of the own
  channels page never received a ticket notification. The enqueue now reads the
  `ticket.created` selection of §11.4 and writes one ntfy row per user who
  selected ntfy, carrying that user's topic (the stored account topic or
  `stoerdesk-<userId>`); the drain passes the topic to the adapter. A user
  without a selection keeps the instance topic, and a critical ticket never
  queues the ntfy channel twice.

### Added
- The ntfy deep link of the subscription QR carries its host (WP-M14-33, out of
  band in phase 14): the ntfy app opens and subscribes a topic only with the
  host-carrying form `ntfy://<host>/<topic>` (the docs state that a
  `https://<host>/<topic>/subscribe` is not possible on Android), so the
  payload `ntfy://<topic>` of WP-M7-03 and WP-M14-13 never landed on a phone.
  The deep-link branch of `subscriptionValue` in
  `apps/web/src/features/settings/NtfySubscription.tsx` and the `deepLink` of
  `GET /api/v1/notifications/accounts/ntfy` in
  `apps/api/src/notifications/routes.ts` now build the documented form (host =
  the public server address without scheme, `?secure=false` for an `http://`
  server). No credential, token or user id enters the QR or the deep link —
  ntfy offers no URL-login scheme and ADR-0005 keeps every secret write-only,
  so a protected topic is unlocked by a login in the ntfy app itself. The
  adapter, the payload and the web-address branch of the card are unchanged.
- The selection of the channels per event type on the own channels page
  (WP-M14-17): `/settings/notifications` shows one row per event type of
  `specs/10-notifications.md` §11.4 with the channels as checkboxes — a
  channel that is not configured is not offered and a configured channel
  without a linked account of the user is marked as such; the selection is
  read from and replaced with `PUT /api/v1/notifications/preferences`
  (WP-M14-16) and its hint names the precedence rule of §11.4. Texts in
  `de` and `en`.
- The WhatsApp Web bridge becomes a channel adapter (WP-M14-14):
  `sendWhatsAppNotification` posts `{ chatId, text }` with
  `Authorization: Bearer <token>` to `POST {baseUrl}/messages` — the ADR-0020
  bridge contract of §11.6, StörDesk ships no browser and keeps no WhatsApp
  session. Only `200` and `202` mean accepted, every other answer is a
  `WhatsAppError('http_error')` with the status only — the bearer never enters
  an error message. The chain entry in `channels/index.ts` places
  `whatsapp` behind `webpush` (§11.1 order); the channel enters the chain only
  with the `WHATSAPP_BRIDGE_URL` / `WHATSAPP_BRIDGE_TOKEN` environment keys,
  and the send prefers the row `whatsapp` of `notification_channels`
  (`config.baseUrl`, `config.chatId`, write-only `secret`) over the
  environment (§11.2) over its own short-lived pool. No compose service, no
   user account and no pairing — that stays WP-M14-15.
- The chats of the bridge and the WhatsApp Web account (WP-M14-15):
  `apps/api/src/notifications/whatsapp-linking.ts` reads the chats of the bridge
  over `GET {baseUrl}/status` with `Authorization: Bearer <token>` (the ADR-0020
  contract of §11.6) — `readBridgeStatus(config)` answers `{ connected, chats:
  [{ id, label }] }` and a missing base URL, an unreachable bridge, a non-ok answer
  or an invalid JSON answer all resolve to `{ connected: false, chats: [] }`, never
  an error of the administration; the bearer never enters an answer, a log or an
  error message. `GET /api/v1/notifications/accounts/whatsapp/status` (session)
  answers those chats to the own channels page, `POST /api/v1/notifications/accounts/whatsapp`
  stores the chat id the user picked as the account of the user via `storeAccount` of
  WP-M14-08 (`externalId` the chat id, `label` the bridge label, no secret) and refuses
  a chat the bridge does not know with `422 invalid_request` and stores nothing. The
  bridge bearer is read from the row `whatsapp` of `notification_channels` (public
  `config.baseUrl`, write-only `secret`) over the `WHATSAPP_BRIDGE_URL` /
  `WHATSAPP_BRIDGE_TOKEN` environment fallback (§11.2, ADR-0020). The own channels page
  gains the WhatsApp Web section — the state of the bridge, the list of its chats, the
  account of the user and the button to remove it — and the texts in `de` and `en`.
  No pairing inside StörDesk (ADR-0020), no reply of a chat and no change of the
  adapter of WP-M14-14.
- The selection of the channels per event type — the API (WP-M14-16):
  `apps/api/src/notifications/preferences.ts` reads and writes the rows of
  `notification_preferences` — one row per user, event type and channel
  (§11.4) — with `readPreferences(database, userId)` (ordered by event type
  and channel) and `writePreferences(database, userId, selection)`, which
  deletes the rows of the user and writes the given selection in one
  transaction, so the selection of another user is never touched and a
  repeated `(event_type, channel)` pair is written once. `GET` and `PUT
  /api/v1/notifications/preferences` are session routes answering
  `{ preferences: [{ eventType, channel }] }`; the accepted values are the
  seven event types of §11.4 (ADR-0021) and the channel kinds of §11.1, an
  unknown event type or channel is a `422 invalid_request` and writes
  nothing. The shared contracts in `packages/shared/src/schemas/notification.ts`
  name the event types and the selection. A user without a row for an event
  type keeps the channel chain of §11.1; the enqueue is unchanged (WP-M14-18),
  the settings page is WP-M14-17 and the database check of the three readiness
  types is widened by migration `0039` of WP-M14-27.

### Changed
- The ntfy onboarding with the subscription QR (WP-M14-13): the ntfy adapter
  gains an optional `userTopic` and prefers the topic of the ntfy account of
  the user of a message when the caller set one, otherwise the configured
  topic of the instance (§11.3); `GET /api/v1/notifications/accounts/ntfy` is
  a session route that answers the public subscription address
  `${NTFY_PUBLIC_URL}/${topic}` and the `ntfy://<topic>` deep link of the
  signed-in user, whose topic is derived from the user id — `stoerdesk-<userId>`
  — and an empty answer (all fields `''`) when the ntfy server is not
  configured; the `NtfySubscription` card of WP-M7-03 is mounted on
  `/settings/notifications` with the API answer as its props (the build-time
  `VITE_NTFY_PUBLIC_URL` / `VITE_NTFY_TOPIC` fallback stays for an image build
  that carries them). No payload of the ntfy adapter changes beyond the
  urgency of WP-M14-07 and no browser push registration is added.
- The Matrix section of the own channels page (WP-M14-12): `/settings/notifications`
  gains a Matrix section with the homeserver, the matrix id and the access token
  (a password field, `autoComplete="new-password"`, never re-filled and never part
  of the page state after a reload); `Connect the Matrix account` sends them to
  `POST /api/v1/notifications/accounts/matrix` and shows the linked account with its
  `externalId` and the `secretSet` notice afterwards; a `Remove the Matrix account`
  action calls `DELETE /api/v1/notifications/accounts/matrix`; a refused pair or an
  unreachable homeserver is shown as inline text. The texts are added in `de` and `en`.
- The Matrix account linking is an API service and two session routes (WP-M14-11):
  `verifyMatrixAccount` asks `GET /_matrix/client/v3/account/whoami` of the
  homeserver of the user with the submitted access token and compares the
  answered `user_id` with the submitted matrix id;
  `POST /api/v1/notifications/accounts/matrix` stores the verified pair as the
  account of the user with the token as the write-only secret via `storeAccount`
  and answers `secretSet` only, while a refused pair, a homeserver that rejects
  the token, an answer that names no user and a malformed request answer
  `422 invalid_request`; `DELETE /api/v1/notifications/accounts/:channel` removes
  the own account of a channel with `204` and answers `404` for an unknown
  account. The token never appears in an answer, a log or an error message.
- The readiness allocation announces itself (WP-M14-26, spec and ADR-0021 only —
  no product code): `oncall.assigned`, `oncall.swap_requested` and
  `oncall.unconfirmed_reminder` join the notification event types, the
  technician selects their channels for them in `/settings/notifications`, an
  allocated technician and a swap request enqueue outbox rows in the transaction
  of the shift write, the escalation scan writes one
  `oncall.unconfirmed_reminder` per unconfirmed shift within
  `oncall.reminder_unconfirmed_h`, the outbox gains `event_type` and a nullable
  `shift_id` with the rule that exactly one of `ticket_id` and `shift_id` is set
  (migration `0039`) and an assigned `DRAFT` readiness becomes confirmable — the
  acceptance publishes it. `specs/04-oncall.md` §4a.3, §4a.4, §4a.9 and
  `specs/10-notifications.md` §11.4, §11.5, §11.7, §11.10, §11.12, §11.14 carry
  the contract, ADR-0021 the decision.
- The own channels page `/settings/notifications` lists the channels of §11.1 with
  the state of the account of the signed-in user (WP-M14-10): the Telegram section
  asks the linking API of WP-M14-09 for a one-time code, shows it as text with the
  bot guidance, submits it and shows the linked chat id and account; API errors
  arrive as inline text, removing an account is a placeholder section until the
  `DELETE` route of WP-M14-11 (the route is never called) and the settings menu
  gets the entry "Benachrichtigungen" / "Notifications" in the Personal group.
- The Telegram account linking is an API service and two session routes (WP-M14-09):
  `POST /api/v1/notifications/accounts/telegram/code` creates a one-time code
  (six unambiguous characters, ten minutes, used once) in the write-only settings
  row `notifications.telegram.code` bound to the requesting user, and
  `POST /api/v1/notifications/accounts/telegram` reads the pending updates of the
  bot (`getUpdates` with the stored offset), matches the code and stores the chat
  id as the Telegram account of the user via `storeAccount`; a wrong, expired or
  unknown code and a code of another user answer `422 invalid_request`, and the
  bot token never appears in an answer, a log or an error message.
- The prepared send view offers an HTML copy instead of the e-mail button
  (WP-M14-34): a `mailto:` body can only carry plain text, so the "E-Mail
  versenden" button is removed (the send returns later as a server-side WP)
  and "Kopieren (HTML)" copies the prepared ticket block to the clipboard with
  the browser's HTML flavour — `execCommand('copy')` over a programmatic
  selection, `ClipboardItem` as fallback — and the hint names the paste step
  into the e-mail program; the `email.*` texts of both languages are gone.
- The e-mail body of the prepared send view keeps real line breaks (WP-M14-22
  follow-up): the `mailto:` body is joined with `\n` and encoded only once —
  the literal `%0A` in the body is gone — and the title, the reported fault
  types and the deadline are added as their own lines.
- The accounts of the users are a service (WP-M14-08): `listAccounts`,
  `storeAccount` and `deleteAccount` read, upsert and remove the account of a
  user at a channel — at most one per channel, an update without a new secret
  keeps the stored one, and no answer carries the write-only secret (only
  `secretSet`).
- The prepared send view replaces the e-mail and the pdf view (WP-M14-22): the
  ticket detail header carries a paper-plane button ("Versenden" / "Send") that
  opens `/tickets/:ticketNo/send` — one branded, prepared view with the two
  buttons "Als PDF speichern" (`window.print()` with the A4 print CSS) and
  "E-Mail versenden" (a prefilled `mailto:` link) on top; all history events
  are visible in full (date, label, actor and event text), every block avoids
  page-break cuts and the photos appear on screen and in the printout; the
  former views `ticket-email-page.tsx` and `ticket-pdf-page.tsx` and the routes
  `/tickets/:ticketNo/email` and `/tickets/:ticketNo/pdf` are gone.
- A notification message carries the content of `specs/10-notifications.md` §11.5
  (WP-M14-07): the outbox target and `messageOf` now include the ticket number,
  priority, object name and location, system type, short text of the report and
  the AA/SA work order number if present — never a photo or contact data; the
  ntfy adapter publishes a critical ticket as `Priority: urgent` (the normal
  `default` otherwise) in the header and the JSON payload.
- The channels have their administration page (WP-M14-06): `/admin/channels`
  lists the channels of `GET /api/v1/admin/channels` with their state and public
  configuration, saves the editable fields and an optional write-only secret
  through `PATCH /api/v1/admin/channels/:kind` and sends a test message through
  `POST /api/v1/admin/channels/:kind/test`; the secret field never shows a
  stored value, the settings menu links the page as "Kanäle" / "Channels".
- The channel configuration has its API (WP-M14-05): `GET /api/v1/admin/channels`
  answers the effective configuration of every channel behind `notification.read`
  and `PATCH /api/v1/admin/channels/:kind` plus
  `POST /api/v1/admin/channels/:kind/test` behind `notification.write`; a
  non-empty secret replaces the stored one, an empty or missing secret leaves it
  untouched, no answer carries a secret and a failing test send is a `200` with
  `delivered: false` and the adapter code.
- The configuration of the messenger channels lives in the database (WP-M14-04):
  migration `0033_notification_channel_config.sql` extends `notification_channels`
  with `kind` (unique), `enabled`, `label`, `config` (jsonb) and the write-only
  `secret` and creates `notification_accounts` and `notification_preferences`;
  the service `apps/api/src/notifications/config.ts` answers the effective
  configuration per kind (`readChannelConfiguration`) — a row wins over the
  environment, a kind without a row keeps its environment values, a disabled
  channel is not configured — and carries `secretSet` instead of the secret.
- The escalation administration speaks the language of the interface (WP-M13-18):
  the stage headings use the stage name of the current language, the reference
  events, the condition fields and operators, the action types and the channels of
  a notify action show their i18n label instead of the raw key and the broken
  German page texts (English leftovers, the inverted add/remove labels and the
  nonsensical `any` mode) are repaired; the saved payload keeps its technical keys.
- The back links of the administration and settings pages lead to the settings
  menu (WP-M14-02): the twelve pages that carry a back link point to
  `/settings` instead of the retired `/admin`, and the three back-link texts
  say "Zurück zu den Einstellungen" / "Back to settings".
- The standalone administration menu is gone (WP-M14-01): the page `/admin` and
  its module cards are deleted, every administration module is a link of the
  settings menu at `/settings`, the retired address `/admin` and the retired
  update page `/admin/update` redirect there, and the texts of the removed page
  (`settings:admin.home.*`, `common:auth.links.admin`) leave `de` and `en`.
- The escalation logic of phase 13 is complete (WP-M13-09 … WP-M13-17): the ticket
  detail view replaces the workflow buttons with the selection of the stages the
  server answers as reachable (`availableStages`); a choice runs the workflow route of
  that milestone and the comment goes to the comment route. The former manual
  escalation is gone: the route `POST /api/v1/tickets/:ticketNo/escalate`, the settings
  routes `GET/PUT /api/v1/settings/escalation-stages`, the shared contracts of the
  former catalogue, the hard-coded `ESCALATION_RULES` and the administration page
  `/admin/escalation-stages` are removed, `/admin/deadlines` redirects to the new page.
  The new administration page `/admin/escalation` carries the tabs `Fristen` (deadline
  hours per priority) and `Stufen & Regeln` (the stages, their rules with reference,
  minutes per priority, condition and ordered actions); the rule editor saves with one
  `PUT /api/v1/escalation/config`, the condition builder reads the closed field list and
  the operators from the shared contract, the action editor offers the configured
  channels (`GET /api/v1/escalation/channels`), the webhook endpoints and the note text
  with drag-and-drop order. The reaction minutes leave the deadlines settings
  (`GET/PUT /api/v1/settings/deadlines` answers the hours only) and the scan never reads
  the legacy `ticket.escalation.*` rows again — the seed is the only reader. The phase-13
  exit criterion asserts that a stage rule fires once per threshold, its condition
  decides, the three actions write their rows, the deadline rules fire at 80 % and 100 %
  and the removed routes answer `404`.
- CI browser install is resilient (no work package, ADR-0018): the runs `v1.1.2` …
  `v1.1.7` failed in `Install Chromium for the E2E smoke test` with
  `Temporary failure resolving 'azure.archive.ubuntu.com'` and apt exit `100` — the
  runner could not reach its Ubuntu package mirror, the app code and the tests were fine.
  The step now writes `Acquire::Retries "4"`, `Acquire::http::Timeout`,
  `Acquire::ftp::Timeout` and `DPkg::Lock::Timeout` into `/etc/apt/apt.conf.d`, caps one
  attempt with `timeout 300`, repeats the whole `npx playwright install --with-deps
  chromium` once 30 seconds later and, if the mirror stays unreachable, takes the browser
  alone from the Playwright CDN and writes a `## Chromium without browser dependencies`
  block into the run summary. A mirror outage costs minutes, not a version without images.
  The gate stays strict: without a browser from apt and from the CDN the step fails, the
  run stays red, `Dispatch publish run` never starts and `scripts/e2e-check.mjs` refuses
  the tests against a browser that does not start (`PLAN.md` §18.2).
  today (out of band, closes WP-M12-09): item 5 clicks the inline acknowledge button of
  the escalation section instead of the dropdown removed by WP-M12-06, item 1 asserts the
  photo previews with `expect(…).toHaveCount(2)` and the run exits with the status code of
  `main()`.
- The escalation stages are the workflow milestones (WP-M13-01, ADR-0017):
  `specs/07-escalation.md` defines the five stages (`review`, `work_order`,
  `assignment`, `acceptance`, `acknowledgement`), a stage as a milestone to be
  reached, the waiting deadline per priority, the typed conditions, the actions
  (`notify`, `webhook`, `history`), the relational data model and the API. The
  manual stage catalogue and the `level` of the hard-coded rules are gone —
  phase 13 implements the decision.

### Added
- The working plan of the messenger channels (WP-M14-03): `specs/10-notifications.md`
  carries the reviewed contract of the channels — the configuration in the
  database with the environment as the fallback, the accounts of the users, the
  linking of Telegram, Matrix, ntfy and WhatsApp Web, the selection of the
  channels per event type, the mandatory minimum channels of critical tickets,
  the content of a message and the warning on a failed channel. ADR-0019 decides
  that the configuration of a channel and the accounts of the users live in the
  database (the environment stays the fallback, the secrets stay write-only),
  ADR-0020 decides that WhatsApp Web is an external bridge of the operator:
  StörDesk speaks a small HTTP contract to it and ships no browser and no
  WhatsApp session. The phase is split into WP-M14-04 … WP-M14-21.
- Acceptance suite for items 1–12 (WP-M12-02, closes phase 12):
  `scripts/e2e-acceptance.mjs` drives the criteria of `specs/16-acceptance.md` §16.1 in
  one ordered run against a throwaway database and the running API/web pair — QR report
  with two photos and office notification, flight-mode report, competing claim, decline
  and acknowledge rules, deadline escalation, object API, fault-free counter, statistics
  median, channel retry/fallback, web-push delivery and the on-call calendar. Every item
  prints `PASS`/`FAIL`/`UNVERIFIED`, the run ends with `acceptance: 11/12 verified`
  (item 11 `UNVERIFIED` by design: the web app has no push-subscription registration).
- The top-right dropdown of the shell is gone (WP-M12-08): the gear next to the version
  opens the settings page directly, the logout moved to the account group of that page
  and the header keeps only the logo, the company name, the top-level links and the
  version.
- Settings overview page (WP-M12-07): `/settings` lists every settings and administration
  destination as a link card, grouped by topic — "Persönlich" (own settings, own
  readiness), "Darstellung" (appearance, dashboard and statistics), "Meldungen"
  (tickets, new report, statistics), "Objekte" (objects, QR stickers), "Verwaltung"
  (administration, users, roles, groups, fault types, detected errors, deadlines,
  escalation stages, on-call plan, BMAcloud sync, API keys, webhooks) and "Konto" with
  the signed-in e-mail and the logout button.
- Ticket detail escalation section (WP-M12-06): the top-right hamburger menu is gone and
  its actions live in one section under the photos — the status-dependent workflow
  buttons, e-mail, cancel, delete and "Zurück zur Liste" as visible buttons with their
  existing confirm panels, plus a stage dropdown offering "Kommentar" and every
  configured escalation stage with the stage after the last manual escalation preselected
  and the text field next to it. A stage is written as `escalation_set` (forwards or
  backwards), the chosen stage is named in the history row and all labels come from the
  new `ticket:detail.escalation.*` keys in `de` and `en`.
- Manual escalation write (WP-M12-05): `POST /api/v1/tickets/:ticketNo/escalate`
  (guarded by `ticket.comment`) appends either a `comment` event or one
  `escalation_set` event with the chosen stage and text. The stage may move
  forwards or backwards; the route changes no status, assignment or deadline.
- Escalation-stage administration (WP-M12-04): `/admin/escalation-stages` manages the
  ordered stages with key, German and English name and deadline minutes, reorders them
  by drag and drop, and stays read-only without `settings.write`.
- Freely definable manual escalation stages (WP-M12-03): the shared contract
  `packages/shared/src/schemas/escalation-stages.ts` orders stages by array position,
  requires German and English names (more locales stay possible) and a deadline per
  stage; the settings service stores the catalog in `ticket.escalation_stages`,
  `GET /api/v1/escalation-stages` serves it to every holder of `ticket.read` and the
  `settings.read`/`settings.write` pair under `/api/v1/settings/escalation-stages`
   administers it.
- One display for both surfaces (WP-M10-36): the wall monitor no longer has its own
  view — `/tv/:token` renders the shared `DashboardDisplay` the start page renders
  (statistics first, then the open tickets). On the wall nothing is clickable: the
  tiles, the ticket numbers and the channel tile are plain blocks and the primary
  action is not offered — a display is never interactive.
- Acceptance criteria as a reviewable slice (WP-M12-01): `specs/16-acceptance.md` is
  filled by mirroring the acceptance summary of `PLAN.md` §20 (items 1–12) — the
  original book chapters 18 + 19 were not supplied — and adds the mapping of every
  item to the already-implemented surfaces (QR report path, offline flight mode,
  offer claim, decline, acknowledge, escalation, object API, dashboard counter,
  statistics, notification fallback, web push, on-call calendar). Documentation only;
  the phase-12 split announces WP-M12-02, an acceptance end-to-end suite for items
  1–12 (`scripts/e2e-acceptance.mjs`, planned).

- "Bereitschaft" becomes a menu entry of its own (WP-M10-35): the header navigation shows
  `Dashboard`, `Tickets` and `Bereitschaft` ("On call"), the entry leads to the readiness
  page `/oncall` and stays active there.
- The readiness page of the office (WP-M10-34): `/oncall` shows the readiness calendar of
  everybody first and the own readiness below it — the personal iCal feed, the own shifts
  with confirm, decline and swap. A button to the administration of the readiness
  (`/admin/oncall`) is visible only for a user with the permission `oncall.admin`.
- The readiness calendar of the office (WP-M10-33): the new `ReadinessCalendar` component
  shows the week of everybody who has the readiness — every shift with its pool, the
  technician and its state — and can step a week back and forward. The names of the
  technicians come from the members of the pool; the times stay Europe/Berlin.
- The start page shows the statistics and the open tickets (WP-M10-32): the fault-free
  counter, the four tiles and the evaluation averages come first, below them the list of
  the open tickets with the mini timeline and the last entry of the history — every row
  links to its ticket. The on-call tile is gone: the readiness has its own page
  (`/oncall`), the snapshot keeps the section for the API.
- One list of the open tickets for the dashboard and the wall display (WP-M10-31): the new
  `OpenTickets` component renders the object, the ticket number, the status, the priority,
  the mini timeline and the last entry of the history of every open ticket. The wall
  display uses it and loses its on-call panel, so both pages show the same blocks. The
  wording "Brennt jetzt" ("Burning now") is gone — the category is called "offene Tickets"
  ("Open tickets") in `de` and `en`.
- The open tickets of the dashboard carry the mini timeline and the last event (WP-M10-30):
  every row of the snapshot's `burningNow` list answers `timelineState`, `percent` and
  `remainingMs` — computed with the shared `computeTicketTimeline` and the same inputs as
  the ticket list — plus `lastEvent`, the newest entry of the history of the ticket (`null`
  when the ticket has no event yet). The dashboard and the wall display can show the same
  thing.
- Festgestellte Fehler (Phase 11): ein Admin-Katalog unter `/admin/detected-errors` (anlegen, bearbeiten, archivieren, löschen mit `409` bei Nutzung) ergänzt die Schließung eines Tickets: im Close-Dialog sind neben dem optionalen Kommentar ein oder mehrere festgestellte Fehler auswählbar, unabhängig von der gemeldeten Störung (WP-M11-01 … WP-M11-07). Die Statistik gruppiert neu nach `byDetectedError` (WP-M11-05, WP-M11-08), Integrationstests decken CRUD, Close-Speicherung und Frequency ab (WP-M11-09).
- The report form and the internal office form now order their fault checkboxes by
  how often a fault was reported in the last 30 days (WP-M10-20): most frequent first,
  ties by key, so the top-left checkbox in reading order is the fault the installation
  saw most often. The fault-catalog administration screen keeps a stable alphabetical
  list and re-sorts itself (WP-M10-20b).
- The dashboard snapshot and start page now surface the most frequent fault of the
  last 30 days (WP-M10-21, WP-M10-21b): a language-neutral `topFault` block (`key` plus
  `count`, ADR-0015 window) rendered on the start page with the localized fault label
  and the ticket count. The block is absent (not shown) when no fault qualifies.
- The uploads volume joins the backup cycle (WP-M10-17): the `backup` profile of
  `docker-compose.yml` mounts the `uploads` volume read-only and every cycle writes a
  pair into the `backups` volume — the database dump `stoerdesk-<timestamp>.sql.gz` and
  the uploads archive `stoerdesk-<timestamp>-uploads.tar.gz` — bounded by the same
  `BACKUP_RETENTION_DAYS`. `docs/DEPLOYMENT.md` documents restoring database and uploads
  **of one cycle together** (a `ticket_photos` row without its file is a broken ticket
  gallery). `scripts/restore-drill.sh` proves the pair end to end on throw-away targets:
  it starts the real `db` and `backup` services in its own Compose project and volumes,
  seeds rows and two photo files, lets the profile write dump + archive, restores both
  into a fresh database and a fresh uploads volume and compares the row counts and the
  photo manifest; without a Docker daemon it exits 1 as `UNVERIFIED`, never green.
  `scripts/docker-smoke.sh` runs the drill after the health checks, so the Docker CI job
  proves it (ADR-0014 decisions 5 and 6).
- Phase 10 is complete (WP-M10-18): the exit integration test mints an API key, drives
  the external object and ticket API, verifies the signed webhook delivery, and covers
  the CSV import and the personal-data export and erasure paths. The phase closes with
  no open follow-up; phase 11 starts next.
- A saved comment is visible at once (WP-M5-17): the service worker serves the ticket
  detail from its `internal-tickets` cache, so the read after a write answered with the
  copy from before the write and the comment stayed invisible until the next reload. A
  write to a ticket now drops that copy — the service worker owns the cache, so it
  invalidates it itself.
- The comment composer warns before it writes (WP-M5-18): clicking "Kommentar speichern"
  opens a dialog that names the append-only rule — a saved comment can no longer be
  changed or deleted — shows the text again and offers "Speichern" and "Abbrechen". The
  write runs only after the confirmation.
- The comment field checks the spelling with the dictionary of the browser (WP-M5-18): it
  carries the interface language (`de` or `en`) and `spellCheck`, and a line under the
  field names the browser spell check. It works offline and ships no extra download.


- Dashboard evaluation block on the start page (WP-M10-19b): below the tiles the page
  shows the four averages of the snapshot's `evaluations` block — review, first response,
  acknowledge and processing time — as whole minutes, `keine Daten` for a `null` average,
  with the ticket count of the 30-day window in the panel header. Averages only: the
  worst reaction time (max/p90) is neither part of the snapshot query nor of the page.
- Dashboard evaluations (WP-M10-19): the snapshot gains an `evaluations` block
  (`specs/11-dashboard.md` §11.4a, ADR-0015) with the last-30-day ticket count of the
  counter's qualifying set and four nullable whole-minute averages —
  `averageReviewMinutes`, `averageFirstResponseMinutes`, `averageAcknowledgeMinutes`
  (the §12.2 phases measured from `reported_at`) and `averageProcessingMinutes`
  (`closed_at` minus `reported_at`). Averages only: the SQL has no median, no p90 and no
  max, so the worst reaction time is never calculated and never displayed on the
  dashboard; a window without samples answers `null`. The statistics API and the
  statistics page keep their p90 columns.
- Personal-data export and erasure routes (WP-M10-16): `GET /api/v1/privacy/tickets/:ticketNo/export`
  answers the reporter contact fields, the photo metadata and the audit rows without their
  payloads (never the status token, never the internal notes of other users) and
  `POST /api/v1/privacy/tickets/:ticketNo/erase` takes a 5–1000-character reason, nulls
  `reporter_name`/`reporter_phone`/`reporter_email` and appends exactly one `personal_data_erased`
  event with the reason length and the actor; both are session routes guarded by `user.write` (no
  API-key scope reaches them), erasure is idempotent (a repeat answers `200 alreadyErased` and
  writes no second event) and never deletes the ticket.
- The ticket detail shows the reporter metadata (WP-M2-98e): a backdated report gets
  a `Meldung gemeldet` history row at its real `reportedAt`, and the info table adds
  the channel (Telefon/E-Mail/Messenger) and the reporter kind (intern/extern) from
  the `created` event payload; historic tickets without the payload show `–`.
- The ticket timeline shows `Gemeldet am` and `Erfasst am` (WP-M2-98d): a backdated
  report draws a `reported` marker at the start of the bar while the `created` marker
  stays at the server capture time, so both times are visible; a normal report keeps
  the single `created` marker.
- The internal create form at `/tickets/create` groups the reporter fields
  (WP-M2-98c): a `Meldender` section with the internal/external radio, the active-user
  picker and name/phone/e-mail, a `Meldezeit` field defaulting to now and accepting past
  times, and a `Meldungskanal` radio with exactly one of Telefon, E-Mail or Messenger.
- The internal ticket API accepts a backdated `reportedAt`, the reporter channel,
  the reporter kind and the internal reporter (WP-M2-98b): a report time in the future
  answers `400 invalid_request` (five-minute grace), `received_at` stays server time,
  the deadline starts at `reportedAt`, an internal kind requires an active
  `reportedByUserId` (name and e-mail are filled from that user) and
  `GET /api/v1/tickets/reporter-users` lists the active users for the form.
- Internal reports carry reporter metadata (WP-M2-98): `tickets.reporter_channel`
  (`phone`, `email`, `messenger`), `tickets.reporter_kind` (`internal`, `external`) and
  `tickets.reported_by_user_id` (the internal employee who handed the fault to the
  recorder, FK to `users` with `ON DELETE SET NULL`) arrive with migration `0028`.
  Existing tickets keep `NULL`; the columns are written by the follow-up API, form and
  detail packages.
- Closed tickets older than the retention window lose their reporter contact data (WP-M10-15): the daily `privacy-retention` pg-boss job at 03:30 sets `reporter_name`, `reporter_phone` and `reporter_email` to `NULL` for tickets whose `closed_at` is at or before `now - privacy.contact_retention_months` (24-month default) in batches of 500, removes the `ticket_photos` rows and their files below `UPLOAD_DIR` after `privacy.photo_retention_months` (a missing file is never an error), drops `report_throttle` rows after 30 days and `bma_sync_runs` rows after 365 days — the two open retention questions of phase 2 settle with ADR-0014. The run is idempotent, never edits an append-only event row and never deletes a ticket, and the log carries the four aggregate counters (`anonymized`, `photosDeleted`, `throttleDeleted`, `syncRunsDeleted`) only; the scheduler starts only from the direct API start and the two settings keys are readable through `readPrivacyRetentionSettings`.
- The object list can be imported from a spreadsheet file at `/objects/import` (WP-M10-14): the browser reads the CSV file and posts its text as JSON, so no multipart parser and no server-side upload directory exist. The page shows the header of the file with the target every column resolves to (the submitted mapping first, otherwise the German aliases of §9.4), offers a mapping control per column and keeps an unmapped column out of the import, previews every row with its line, its `new`/`changed`/`unchanged`/`error` action, its changed fields and its row error inline, counts the four actions in a summary and answers the commit action with the `applied` counters of the database. Without `object.import` the page stays read-only — the file never leaves the browser and the notice says why — and the object list links the page.
- The object list can be imported through `POST /api/v1/objects/import/preview` and `POST /api/v1/objects/import` (WP-M10-13): both routes are office-internal and guarded by `object.import` — a session without that permission gets `403 forbidden`, an anonymous one `401 session_invalid` and no bearer scope reaches them. A malformed body or an unknown mapping target answers `400 invalid_request` with the field paths of the failed schema (an unknown target is reported as `mapping.<header>`), an empty file, a duplicated header or an over-limit document as `csv`. The preview answers rows and action counts and writes nothing; the commit repeats it and answers the same shape plus `applied: { created, updated, unchanged, failed }`, so a row error stays visible in its line and never blocks the other rows. Registered from `apps/api/src/index.ts` next to the object routes; the page comes with WP-M10-14.
- The object list can be imported from a spreadsheet file (WP-M10-12): the CSV service reads comma or semicolon files (UTF-8, quoted cells with doubled quotes, LF or CRLF, max. 2 MB and 5,000 data rows), maps the header case-insensitively through the German aliases `objektnummer`, `bezeichnung`, `strasse`, `hausnummer`, `plz`, `ort`, `ansprechpartner`, `telefon`, `email` and `notiz` or an explicit mapping, and previews every row as `new`, `changed`, `unchanged` or `error` with its line, its `{ code, params }` errors and the changed field names. `applyObjectImport` commits the valid rows by `object_no` in one transaction — new rows get a generated QR token, changed rows replace only the mapped fields, unchanged rows stay untouched, a row error never blocks the other rows and a second identical import reports `unchanged` and writes nothing. `qrToken`, `externalId`, `externalType` and `active` are never import fields; the routes and the page come with WP-M10-13 and WP-M10-14.
- The webhook administration lives at `/admin/webhooks` (WP-M10-11): list, create, edit and delete endpoints with URL validation, event checkboxes, an active switch and the signing secret shown once; the settings menu links the page, writes are hidden without `settings.write`, and the OpenAPI document now carries the `/webhooks` and `/webhooks/{id}` admin paths.
- Webhook delivery runs every minute (WP-M10-10): `ticket_events` rows for `created` and status-changing events become one `PENDING` delivery per active subscribed endpoint, the unique endpoint/event key makes the scan idempotent, and each request carries `X-StoerDesk-Signature: t=<timestamp>,v1=<hmac>` plus `X-StoerDesk-Event`. A non-2xx answer, timeout or network error retries after 1, 5, 25 and 125 seconds and ends `FAILED` on the fifth attempt; the log carries status and duration only.
- Webhook endpoints are managed under `GET/POST/PATCH/DELETE /api/v1/webhooks` (WP-M10-09): `settings.read`/`settings.write`, URL validation, the two subscribed events `ticket.created` and `ticket.status_changed`, and a signing secret that is answered once on create and never listed again. The new `webhook_endpoints` and `webhook_deliveries` tables keep the delivery history after an endpoint is deleted.
- The external ticket API accepts bearer keys (WP-M10-08): `POST /api/v1/tickets` resolves the object by `objectNo`, writes `source = API` and records a `system` actor with the key id; `GET /api/v1/tickets` supports `updated_since`, `status`, `objectNo` and `limit`; `PATCH /api/v1/tickets/:ticketNo/work-order` uses the existing state machine and answers `409 invalid_transition` or `404 ticket_not_found`.
- The external object API accepts bearer keys (WP-M10-07): `GET /api/v1/objects` supports `updated_since` and `limit`, `PUT /api/v1/objects/:objectNo` creates or replaces an object, `POST /api/v1/objects/bulk` reports one result per item without rolling back valid rows, and the soft delete accepts the `objects:write` scope.
- The external API is published as OpenAPI 3.1 under `/api/docs` and `/api/docs/json` (WP-M10-06): bearer authentication, API-key management, object list/read/upsert/bulk/soft-delete and ticket list/create/work-order paths, generated from the shared Zod contracts; office-internal routes stay out.
- External requests can authenticate with `Authorization: Bearer sk_...` (WP-M10-05): `apiKeyPlugin` verifies the hashed key, rejects malformed, revoked and expired keys with `401 api_key_invalid`, and the dual guard `requireScopeOrPermission` accepts a session permission or an API-key scope while a key without its scope gets `403 forbidden`.
- The admin page `/admin/api-keys` lists, creates and revokes external API keys (WP-M10-04): scope checkboxes, optional expiry, the plaintext token shown exactly once with a dismiss action, and read-only mode without `apikey.write`.
- Phase 10 (API and hardening) is split and started (WP-M10-01): `specs/08-objects-api.md`
  now defines CSV object import (§9.4) and the external REST API (§9.5) — bearer API keys
  with the four scopes `objects:read`, `objects:write`, `tickets:read`, `tickets:write`,
  object upsert/bulk/updated-since, external ticket creation and work-order updates,
  HMAC-signed webhooks with five backoff retries and OpenAPI under `/api/docs`.
  `specs/14-nfr.md` defines the privacy retention (contact data and photos 24 months after
  closing, throttle rows 30 days, BMA sync history 365 days), personal-data export and
  erasure, the uploads backup and the restore drill. ADR-0013 and ADR-0014 record the
  decisions; the phase is split into WP-M10-02 … WP-M10-18.
- Phase 9 (dashboard and statistics) is complete (WP-M9-01 … WP-M9-18): the live
  dashboard at `/` reads one snapshot (`GET /api/v1/dashboard`) and updates through the
  authenticated SSE stream (`/api/v1/dashboard/stream`, 30-second refetch fallback) with
  the fault-free counter and record, the open/overdue/unreviewed/pool tiles, the on-call
  and channel tiles; the token-protected wall display `/tv/:token` polls every 15 seconds
  without a session and never renders contact data; `/admin/dashboard` rotates the TV
  token, toggles anonymisation and sets the conspicuous threshold; the statistics page
  `/stats` filters by range and dimensions in the URL and renders reaction times, an
  inline-SVG frequency series, the three groupings, top objects with the conspicuous
  marker and the compliance and decline cards; `/api/v1/stats/*` answers the JSON sections
  and `/api/v1/stats/export.csv` streams the semicolon-separated export under `stats.export`.
  The exit criterion (counter reset on a new report, ignored test/cancelled tickets and the
  printed reaction-time median) is proven by `phase9-exit.integration.spec.ts`.

### Changed

- The ticket detail view carries its e-mail export and its cancel button in the header
  (WP-M12-09): the export is an icon button (envelope, 44 px target, the localized label
  as `aria-label`) next to the cancel button, both at the top right beside the status and
  priority badges. The escalation section keeps the status-dependent workflow actions and
  the permanent delete. The way back to the list is deleted for good — the button, its
  handler branch and the `detail.back` / `detail.menu.back` labels of `de` and `en` are
  gone.

- The i18next line of the web app is aligned so one copy resolves: `apps/web/package.json`
  now pins `i18next: ^27.0.1` and `react-i18next: ^17.1.13` instead of `^26.5.11` and
  `^17.1.9`. `react-i18next` 18 declares the peer `i18next >= 27.0.0`, so Dependabot's
  bump of `react-i18next` installed a second, workspace-local copy of `i18next` next to
  the hoisted one — two different `i18n`/`TFunction` types, and `tsc --noEmit` rejected
  every hand-over between `apps/web/src`, `packages/shared` and the tests. The 27 line is
  the one 17.1.13 was released with, so the app keeps its 17-line behaviour.

- The ticket detail history (`Verlauf`) always names the date next to the clock time: the
  event rows used to carry a bare `hh:mm:ss` stamp, so two entries of different days were
  indistinguishable. They now render date and time through the same formatter the
  backdated-report row already used, and both timestamp columns of the section widened
  from `w-32` to `w-36` so the en-US form no longer overflows its gutter.

- The ticket detail names the fault field "Gemeldete Störungsart" ("Reported fault type",
  WP-M11-11): the chips under title and description are the fault types this report was made
  for, not the whole catalogue. The shared key `ticket:detail.field.faults` changed in `de`
  and `en`, so the ticket e-mail export shows the same label; the report form, the internal
  creation form and the fault-catalog administration keep their wording.
- The object list lost its external indicator (record WP-M9-26 — the commit `d1e34eb`
  landed without a work package): the rows no longer carry the "extern gepflegt" badge of
  WP-M2-39 next to the object number and the `Typ` column of WP-M2-66 (header, cells and the
  `externalTypeCategory` import) is gone, so the list shows object number, name, address,
  active badge and the edit/delete actions as a flex row side by side. The keys
  `list.externalBadge`, `list.externalHint` and `list.columns.type` were deleted in `de` and
  `en`. Nothing else changed: the API still answers `externalId` and `externalType`, the BMAcloud
  sync still writes them and the object detail still carries the external information — the
  list simply stopped presenting them. The record also corrects the off-by-one WP references
  in the `branding-state.ts` module comment (internal creation gate WP-M9-25, ticket view
  gate WP-M9-24).

- The branding title switch has one reading point (WP-M9-23): the `titleEnabled`
  flag of the branding row was read four times with four copies of the same rule.
  `apps/api/src/settings/branding-state.ts` exports `readTitleEnabled` (the row
  read), `parseTitleEnabled` (the value rule) and the `BRANDING_KEY` constant;
  the branding route, the public QR resolve, the public report and the internal
  creation read the flag through it. A missing or malformed row still means
  `false`, so the behaviour is unchanged.

### Fixed

- Acknowledging a ticket stops its timeline (WP-M12-02, acceptance item 5): the
  workflow transition only wrote `status` and `updated_at`, so `acknowledged_at`
  (and with it `timeline.stoppedAt`) stayed `null` even though the status was
  `ACKNOWLEDGED`. `transitionTicket` now writes the workflow columns of `PLAN.md` §7
  for its milestones in the same statement as the status — `review_started_at` and
  `reviewed_by_user_id`, `work_order_type` and `work_order_number`, `accepted_at`,
  `acknowledged_at` and `closed_at`. A ticket therefore never shows a status whose
  timestamp is missing; `apps/api/src/tickets/__tests__/workflow-columns.integration.spec.ts`
  proves it.
- The offline conflict banner of the open ticket detail updates without a reload
  (WP-M5-06): after the replay of an offline write answered `409 invalid_transition`,
  the conflict row was written to the outbox but the banner of the page kept the rows
  it had read on mount — a CI run of the phase-5 E2E lost the reload race and reported
  `getByText('Konflikt: invalid_transition – aktueller Status CANCELLED')` as not found
  (one of fourteen Playwright tests failed, the check run exited 1). `apps/web/src/lib/outbox.ts`
  announces every write to an `internal_actions` row through `onActionChange`, the hook
  `useInternalActions` re-reads the rows of its ticket on that announcement and the E2E
  asserts the conflict on the open page before it reloads.

- The phase-5 offline E2E (`apps/web/e2e/offline-internal.spec.ts`) is green again after
  WP-M12-06 and WP-M12-08 removed the dropdowns: both tests still opened the options
  dropdown with `getByRole('button', { name: /Optionen|Options/ })` before choosing the
  acknowledge entry, so the locator waited 30 s for a button that no longer exists and four
  of the fourteen Playwright tests failed. The acknowledge button of the escalation section
  is clicked directly; its inline confirmation panel is addressed as before.

- The administration-home test located the deadlines card by `/Fristen|Deadlines/`, which
  stopped being unique once WP-M12-04 added the escalation-stage card with the hint
  "Stufen, Namen und Fristen …": `screen.findByRole('link', …)` found two links and the
  assertion failed. The locator is anchored to the card title (`/^(Fristen|Deadlines)/`)
  and keeps the href and the "not planned" checks.

- The future-report-time warning of the internal creation form is German again (WP-M11-12):
  the `de` value of `ticket:internal.create.errors.reportTimeFuture` held an English
  sentence inside a German article (`Die reported time must not be in the future. …`). It now
  reads `Die Meldezeit cannot be in the future. Please choose now or a past time.`, using the
  `Meldezeit` term of the form; `en` already carried the correct English text and stays
  unchanged, so `i18n:check` keeps de/en parity.
- The dashboard stream no longer drops a change that arrives while a client reacts to the
  first snapshot (WP-M9-39): `GET /api/v1/dashboard/stream` sent its first snapshot **before**
  it captured the probe baseline. A client that reacts to the snapshot — the integration test
  inserts a ticket right away — could commit its change before the baseline query read the
  table, and the baseline then already contained it. The probe saw no difference and sent no
  second snapshot, so the client waited for a snapshot that never came. The window is one
  database round trip: on a developer machine it is a millisecond, on a loaded CI runner it
  grew past the five-second test budget and the run failed with a timeout in
  `dashboardStream.integration.spec.ts` while the rest of the suite passed. The baseline is
  now captured before the first snapshot, so every change that arrives after the baseline is
  visible to the probe; a change between the baseline and the snapshot is delivered twice,
  which the client ignores.

### Added

- The statistics services of the phase 9 read the tickets and answer the reaction times and
  the frequency (WP-M9-10): `apps/api/src/stats/filters.ts` turns the shared statistics filter
  into a SQL predicate over the `stats_tickets` view — the local days `from` … `to` of
  `Europe/Berlin` become UTC instants with `date-fns-tz`, so a DST day keeps its real length,
  `objectNo` matches case-insensitively, `systemType`, `priority` and `technician` match
  exactly, and test and suspected-spam tickets stay excluded unless the caller opts in.
  `apps/api/src/stats/reaction-times.ts` computes one aggregate per phase (`review`,
  `firstResponse`, `acknowledge`) with the count, the median, the average and the p90 in whole
  minutes, and reports the paused tickets and the pause minutes next to the phases without
  subtracting them (ADR-0012 decision 8). `apps/api/src/stats/frequency.ts` answers the bucket
  series (`day`, `week`, `month` — a week starts on Monday) on the Berlin local date of
  `reported_at`; an empty bucket is answered with `total: 0`, so the chart has a continuous
  axis, and the `bySystemType`, `byFaultTemplate` and `bySource` groupings count the same
  filtered set. The routes, the CSV export and the statistics page follow in WP-M9-11 and
  WP-M9-12.

- The internal creation form honours the branding title switch (WP-M9-25): the form reads
  `GET /api/v1/settings/title-switch` before it renders and shows its title field only while
  `titleEnabled` is on, so the office never fills in a title the installation does not keep;
  a missing, pending or failed answer means off, and the title travels in the submit body only
  while the switch is on (the server already drops it — WP-M2-95).

- The ticket view honours the branding title switch (WP-M9-24): `GET /api/v1/tickets/:ticketNo` answers `title: null` while `titleEnabled` is off, so the ticket detail view and the branded e-mail view show no title; the stored title stays in the database and reappears when the switch is turned back on. `GET /api/v1/settings/title-switch` (guarded by `ticket.create`) lets the internal creation form learn the switch before it renders its title field; all reads share `readTitleEnabled` from `apps/api/src/settings/branding-state.ts` (WP-M9-23).

- The ticket purge log is append-only (WP-M9-27, audit SEC-013): migration `0024_ticket_purges_append_only` adds triggers to `ticket_purges` — any `UPDATE`/`DELETE` raises `ticket_purges_append_only`, and an inserted `reason` longer than 1000 characters raises `ticket_purges_reason_too_long`.

- Ticket and object search match literally now (WP-M9-28, SEC-012): both searches escape `\`, `%` and `_` through one shared helper (`escapeLikePattern`), so a search string is matched exactly instead of widening the result set (the ticket list search had fixed `%`/`_` — the object search had inherited the same drift).

- Ticket numbers are validated at the entry points (WP-M9-29, SEC-015): `GET /api/v1/tickets/:ticketNo` and the two comment routes reject a malformed `ticketNo` (`ST-<year>-<counter>`) with `400 invalid_request` before touching the database.

- Workflow, delete, photo and comment routes are hardened (WP-M9-30): the decline reason is capped at 1000 characters, decline requires `ticket.decline` (not `ticket.accept`), `ticketNo` is validated at every path parameter, `delete` no longer leaks the raw PostgreSQL message, photo serve is permission-gated with a containment check and `Cache-Control: private, no-store`.

- A report with an invalid photo array no longer leaves an orphan ticket behind (WP-M9-31, SEC-014): `validateReportPhotos` runs count, data-URL prefix, decoded size and magic-byte checks before the ticket transaction; a repeat keeps its old gallery and is not re-validated.

- The branding logo is byte-checked now (WP-M9-32, SEC-019): `validateLogo` reuses `detectImageType` and rejects any `data:image/png`/`data:image/jpeg` payload whose magic bytes disagree with the claim, so arbitrary bytes no longer land in the settings jsonb.

- The iCal feed expires and rechecks (WP-M9-33, SEC-005/SEC-011): the HMAC of the capability token is salted with a rolling 1-year bucket so an abandoned URL expires within ~2 years; the route filters `users.active = true` and re-checks `PERMISSIONS.oncall.read` on every request; `Cache-Control: no-store` and a raised route `logLevel` keep the token out of the JSON file log, `docker logs` and browser/proxy caches.

- `SESSION_SECRET` needs 32 characters (WP-M9-34, SEC-016) and logout requires the session cookie (SEC-006): the env schema adds `.min(32)` (the 37-char dev default still passes), and the logout route only calls `destroySession` when the `SESSION_COOKIE_NAME` cookie is present, so a cross-site POST (which browsers strip cookies for under SameSite) can no longer force a logout.

- The dead `prefix: '/api/v1/oncall'` option on the on-call pools plugin is gone (WP-M9-35, SEC-010): `fastify-plugin` skip-override ignored it, so the option was misleading dead code that would have doubled the prefix if the plugin ever became encapsulating.

- The public comment route is bounded (WP-M9-36, SEC-004, API side): the schema requires the ticket's `statusToken` and a fresh `clientUuid` per submission; the service rejects a comment whose `statusToken` disagrees with the stored one with `403 comment_status_token_mismatch`, replays the same `clientUuid` via `internal_action_receipts` and runs the report spam throttle (suspicious comments are tagged with `suspected_spam: true` in the event payload).

- The web comment path now carries the report spam contract (WP-M9-37, SEC-004 web side): the comment POST body adds `clientUuid`, `website`, `verification` and the reporter's own `statusToken`; `handledErrorCodes` grows `comment_status_token_mismatch` so the form shows the API notice instead of an unhandled error page.

- BMAcloud credentials GET now needs `object.import` (WP-M9-38, SEC-009): the route used to be readable by every role with `object.read` (reporter_internal, office, oncall, manager), which exposed the metadata of "is the API key set and where does it come from"; the admin-side PUT/DELETE already required `object.import`, so the GET now matches.

- The ticket data model gains the test-data flag (WP-M9-02): migration `0023_ticket_is_test`
  adds `tickets.is_test` as a not-null boolean with default `false`, plus the partial
  `tickets_is_test_reported_at_idx` index for `is_test = false`. Drizzle declares the
  column as `isTest`, and the ticket-table integration test proves that default inserts
  are real data, explicit test data survives, and `NULL` is rejected.

- The dashboard snapshot service lands (WP-M9-05): `apps/api/src/dashboard/service.ts`
  computes the dashboard snapshot — fault-free counter and record, the open/per-status/
  overdue/unreviewed/pool-size tiles, the on-call tile (name, shift end, warning) and the
  per-channel outbox status (last sent/failed, pending/failed), plus the ten nearest
  burning-now deadlines. Every read goes through the `stats_tickets` view, `outbox` or
  the on-call coupling, never a ticket detail; optional sections (`onCall`, `channels`)
  are `null` when the caller lacks the permission. Covered by an integration test against
  a throwaway database (`dashboardService.integration.spec.ts`, skips without
  `TEST_DATABASE_URL`).

- The dashboard of the office ends with its tiles (WP-M9-19): the "Brennt jetzt" list is
  gone from the start page — the wall display of phase 9 keeps it
  (`specs/11-dashboard.md` §11.5) — and every tile ("Meldungen gesamt", "offen",
  "überfällig", "ohne Prüfung") is one link over its whole area instead of a link on the
  text only. The pending and the failed state of the four count queries stays visible
  below the tiles.

- Phase 9 (dashboard and statistics) is split and started (WP-M9-01): `specs/11-dashboard.md`
  and `specs/12-stats.md` carry the reviewed contract of the live dashboard, the wall display
  `/tv/:token` and the statistics slices with their API shapes and boundaries. ADR-0012
  settles the phase-9 decisions: SSE instead of a five-second polling probe, plain SQL views
  instead of materialized views, a computed fault-free record, a stored rotatable TV token,
  `tickets.is_test` for test data, inline SVG charts and `stats.conspicuous_threshold`. The
  phase is split into WP-M9-02 … WP-M9-18 in `work-packages/m9/`, implemented in numeric
  order; the exit criterion is the test flag, the counter reset and the reference data of
  WP-M9-18. No product code in this commit.

- The phase-8 exit criterion (WP-M8-16): the new integration test
  `apps/api/src/oncall/__tests__/phase8-exit.integration.spec.ts` proves the DST
  rule of the slot generator (167 h in the spring week of 2026-03-23, 169 h in the
  autumn week of 2026-10-19, 168 h in a neutral week) and the atomic swap rule of
  `specs/04-oncall.md` §4a.5 — two concurrent acceptances of one `PENDING` request
  yield exactly one winner, one acceptance event and a `409` for the loser, with the
  shift carrying the winner after approval (approval on) or immediately (approval
  off). Phase 8 is complete.

- Offline on-call shift confirm and decline (WP-M8-15): the web outbox gains a
  Dexie v3 `shift_actions` table keyed by `client_uuid`. `useShiftActions(shiftId)`
  tries the online route first and, while the browser is offline, queues the write
  for replay on app start and `online`; the decline reason is validated before it
  is queued. The my-shifts page shows the queued/failed/rejected state on the shift
  card with retry and, for server rejections such as `oncall_shift_started`, discard.

- The personal on-call iCal feed (WP-M8-12): `GET /api/v1/oncall/ical/:token.ics` is
  public and answers the `PLANNED` and `CONFIRMED` shifts of one user from 30 days ago
  to 180 days ahead as an RFC 5545 calendar with UTC `DTSTART`/`DTEND`, stable UIDs and
  escaped text. The token is the stateless HMAC of ADR-0011 and is verified with a
  timing-safe comparison; any malformed, forged or unknown-user token answers
  `404 ical_not_found`. `SUMMARY`/`DESCRIPTION` come from the user's server locale.

- On-call ticket coupling and warnings (WP-M8-10): `POST /api/v1/tickets/:ticketNo/offer`
  now resolves the on-call person of the default pool in one transaction — a `CONFIRMED`
  (or `SWAP_REQUESTED`) shift wins over a `PLANNED` one and sets `offered_to_user_id` plus
  `offer_escalated_at`; an unstaffed slot clears both and returns the `oncall_unstaffed`
  warning. The `offered` event carries `onCall`, `shiftId`, `poolId` and an optional
  `warning`, and the route accepts an optional `poolId`. `GET /api/v1/oncall/warnings`
  (`oncall.read`) lists unstaffed shifts inside `oncall.unfilled_warning_days` and
  `PLANNED` shifts starting within `oncall.reminder_unconfirmed_h` next to the default
  pool. Offer timeout and group escalation stay in WP-M8-11.

- The deadline administration (WP-M6-14, WP-M6-14b, WP-M6-15, WP-M6-16): the four deadline
  hours per priority and the reaction minutes (standard and critical) of the escalation rules
  are editable at `/admin/deadlines`, backed by `GET/PUT /api/v1/settings/deadlines`. The menu
  entry "Fristen" of the administration is now available. Per-object-type deadlines are not
  implemented; no spec defines them yet.

- Phase 8 (on-call calendar) is split and started (WP-M8-01): `specs/04-oncall.md` now
  carries the reviewed contract for pools, local-time weekly slots, the six shift states,
  confirm/decline, swap requests, ticket coupling, warnings and the personal iCal feed.
  ADR-0011 settles the open swap-approval decision (default `true`, atomic first
  acceptance, original technician responsible until approval) plus local wall-clock weeks
  in `Europe/Berlin`, group-based pool membership, `oncall.default_pool_id` and the
  stateless HMAC iCal token. The phase is split into WP-M8-02 … WP-M8-16 in
  `work-packages/m8/`, implemented in numeric order; the exit criterion is the DST and
  atomic-swap test of WP-M8-16. No product code in this commit.

- The on-call schema lands with migration `0020_oncall_tables` (WP-M8-02):
  `oncall_pools` (unique case-insensitive trimmed name, optional `group_id` with
  `ON DELETE SET NULL`), `oncall_shifts` (range index on
  `(pool_id, starts_at, ends_at)`, unique `(pool_id, starts_at)`, six-state check,
  `ends_at > starts_at`), `oncall_swap_requests` (partial unique `PENDING` per
  shift) and append-only `oncall_events` with a unique nullable `client_uuid` for
  idempotent confirm/decline replays. The `oncall_event_append_only` trigger
  blocks `UPDATE` and direct `DELETE`; the `ON DELETE CASCADE` of a shift still
  passes (`stoerdesk.allow_oncall_event_delete` session bypass, like ticket
  hard-delete). Covered by
  `apps/api/src/db/__tests__/oncallTables.integration.spec.ts`.

- The Web Push channel sends notifications to installed PWAs (WP-M7-09): `apps/api/src/notifications/channels/web-push.ts`
  is the sixth channel adapter of the phase-7 chain and delivers `${title}\n${body}` plus the
  `\n\n<label>: <pwaUrl>` deep link labelled `t(locale, 'notification.action_label')` through the
  `web-push` library (ADR-0010 — encrypted payloads and VAPID JWT signing are not hand-written
  locally). `WebPushConfig` reads `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — configured
  only when all three are set — `sendWebPushNotification` throws `WebPushError('no_keys')` without
  keys and wraps transport failures as `send_failed`, never leaking the endpoint, the keys or the
  private key; an empty subscription list is a successful no-op. The chain entry in
  `channels/index.ts` reads the `push_subscriptions` rows of WP-M2-95 (endpoint, p256dh, auth) over
  a short-lived database pool, so the escalation chain of WP-M7-05 is now signal → matrix → ntfy →
  email → telegram → webpush. PWA push registration (subscribe in the web app, `notification_permissions`
  and the admin failure warning of §12), per-event channel selection and `pushUrl` as an escalation
  parameter stay unimplemented.

- The Telegram channel sends notifications over the Telegram Bot API (WP-M7-08): `apps/api/src/notifications/channels/telegram.ts`
  is the fifth channel adapter of the phase-7 chain and posts the notification as JSON (`chat_id`,
  `text`) to `sendMessage` of an existing bot with plain `fetch` — no library, no ADR, the transport
  of ntfy and Matrix. It keeps the adapter shape of WP-M7-07 — `TelegramConfig` from the existing
  `TELEGRAM_*` keys, `TelegramError` with the codes `no_token` (no request) and `http_error` (status
  only, never the token), `fetch` as its injectable last parameter — and the message content of
  WP-M7-04: `${title}\n${body}` plus a `\n\n<label>: <pwaUrl>` deep link labelled
  `t(locale, 'notification.action_label')` while a PWA url exists, never a photo, never contact
  data. `configuredChannels(env)` gained the `telegram` entry (configured when `TELEGRAM_BOT_TOKEN`
  and `TELEGRAM_CHAT_ID` are both set, appended last), so the escalation chain of WP-M7-05 is now
  signal → matrix → ntfy → email → telegram; `drainOutbox`, `escalationChain` and migration `0019`
  needed no change. Telegram account linking via a one-time code and Web Push (VAPID) keep their
  own WPs.

- The CI pipeline is hardened (WP-M1-28). `.husky/pre-push` refuses a push with more
  than three tags, because GitHub creates no tag push event for such a batch, and
  `AGENTS.md` now requires a push after every work package. The `promote` job of
  `build.yml` runs only after a successful `publish`, so a failed image build cannot
  split `latest`. A new `deploy` job runs after `promote`, only for the highest
  `v[0-9]*` tag, and calls `DEPLOY_WEBHOOK_URL` with `X-Signature-256` and
  `X-Deploy-Token`; a missing target is a skipped notice. `docs/DEPLOYMENT.md`
  documents both secrets and the payload. The `docker-smoke` job now fails when the
  runner has no usable Docker instead of skipping silently.

- A database dump is forced before the API applies pending migrations (WP-M3-17):
  `docker-compose.yml` gained the one-shot `db-backup-pre-migrate` service. It has no
  profile, writes and verifies `/backups/pre-migrate-<stamp>.sql.gz` in the backup
  volume and `api` depends on it with `condition: service_completed_successfully`, so a
  failed or empty dump stops the deployment before any migration runs. A broken
  migration therefore never reaches the database without a fresh dump. The dump lives
  in the existing backup volume and `BACKUP_RETENTION_DAYS` also bounds these copies;
  the periodic `backup` profile service is unchanged. `README.md`, `docs/DEPLOYMENT.md`
  and `.env.example` document the gate. The Docker commands remain unverified in the
  development container (no Docker daemon).

- The e-mail channel sends notifications over SMTP (WP-M7-07): `apps/api/src/notifications/channels/email.ts`
  is the fourth channel adapter of the phase-7 chain and talks to an existing mail server through
  `nodemailer` (ADR-0009 — the plan fixed no SMTP library and the `SMTP_PORT=587` default needs a
  STARTTLS upgrade Node cannot express). It keeps the adapter shape of WP-M7-01 — `EmailConfig`
  from the existing `SMTP_*` keys (`user`/`password` become an `auth` block only when a user is set),
  `EmailError` with the codes `no_sender` and `send_failed`, the transport factory as its injectable
  last parameter — and the message content of WP-M7-04: ticket number as subject, priority and object
  name as body, plus a `\n\n<label>: <pwaUrl>` deep link labelled `t(locale, 'notification.action_label')`
  while a PWA url exists, never a photo, never contact data. `configuredChannels(env)` gained the
  `email` entry (configured when `SMTP_HOST` and `SMTP_FROM` are both set, appended last), so the
  escalation chain of WP-M7-05 is now signal → matrix → ntfy → email and an exhausted row of ntfy
  falls back to e-mail; `drainOutbox`, `escalationChain` and migration `0019` needed no change.
  Telegram and Web Push keep their own WPs, and so do the per-event-type channel choice and the
  mandatory minimum channel for `critical`.

- The phase-7 exit criterion is proven (WP-M7-06): `apps/api/src/notifications/__tests__/notification-exit.integration.spec.ts`
  runs the real API on a throwaway database — a ticket whose only outbox row sits
  on the failing signal channel gets that row `FAILED` after three attempts, the
  fallback row of the next chain channel (`matrix`) is queued in the same
  transaction, drains `SENT` in the same run and really reaches a local Matrix
  mock — and the `GET /api/v1/tickets/:ticketNo` answer carries exactly one
  `notification_failed` (`attempts: 3`) and one `notification_sent` event next to
  the `created` event; a second drain over the terminal rows writes no event and
  no row, and the last channel of the chain ends `FAILED` without a fallback.
  Phase 7 is closed: channel failure retries and falls back, and the history shows
  it (`PLAN.md` §16 phase 7, §20 acceptance 10). No product code changed.

- The channel fallback chain (WP-M7-05): an outbox row that exhausts its three attempts no
  longer simply ends `FAILED` — `drainOutbox` takes the next channel of
  `escalationChain(env)` (the configured channels in `configuredChannels` order,
  `PLAN.md` §12 "then the next channel in the escalation chain"), ends the row `FAILED`
  with its `notification_failed` event and queues one `PENDING` fallback row for that
  channel in the same transaction — same ticket, same machine-readable `{ ticketNo,
  priority, objectName }` target params, no photo, no contact data — but only if the ticket
  has no pending row for that channel already, so a channel is never notified twice. The
  drain loop claims the fallback row in the same run, which the chain length bounds.
  `OutboxDrainResult` gained `fallback` (log code `channel_fallback`). Covered by a
  mocked-channel unit spec (escalation, pending guard, chain end) and a PostgreSQL
  integration spec asserting both rows, both states and both events of one escalation.

- The ntfy `view` action label is localized (WP-M7-04b): `server.de.json` and
  `server.en.json` gained the `notification.action_label` key (`Öffnen` in the German
  reference locale, `Open` in English) and `NtfyConfig` in
  `apps/api/src/notifications/channels/ntfy.ts` gained the optional `locale` of the
  shared `ServerLocale`. The label of a payload is now
  `t(config.locale ?? 'de', 'notification.action_label')` through the shared server
  `t()`, so the hard-coded German literal of WP-M7-01 never reaches a payload again
  (`PLAN.md` §3.1); an unset locale keeps the `de` default and
   `configuredChannels(env)` stays unchanged, because the environment carries no channel
   locale yet. The package announced as "the outbox worker and the localized ntfy action
   label" was split before any code was written (`PLAN.md` §17 file limit): the drain
   worker, its retries and the `notification_sent`/`notification_failed` events moved to
   **WP-M7-04c**.

- The outbox drain worker (WP-M7-04c): `apps/api/src/notifications/outbox.ts` claims the
  oldest `PENDING` outbox row atomically (`UPDATE ... WHERE state = 'PENDING'` plus the
  `(state, created_at)` index of migration 0019), sends through `configuredChannels(env)`,
  retries up to three attempts with backoff, writes `SENT`/`FAILED` and appends exactly one
  `notification_sent`/`notification_failed` event (`actorKind: 'system'`, payload
  `{ channel, ticketNo, attempts }`) to the ticket history per row. Rows whose channel is no
  longer configured end `FAILED`. `startNotificationOutboxJob` runs the drain on a per-minute
  pg-boss schedule with one short-lived pool per job, started only from the direct API start
  next to the other pg-boss jobs; `buildServer()` stays job-free. Covered by a mocked-channel
  unit spec and a PostgreSQL integration spec asserting claims, states, `attempts`, the
  ticket's `created` event and the localized ntfy `view` action label of WP-M7-04b in the
  payload.

- The notification outbox is written with the ticket (WP-M7-04): the
  `notification_channels`, `push_subscriptions` and `outbox` tables land in
  migration `0019_notification_outbox` (the `state` check `PENDING`/`SENT`/`FAILED`,
  `attempts` default `0`, the `outbox(state, created_at)` index; the first two are
  rows only, no routes). `notifications/outbox.ts` adds `enqueueOutbox(database, ticket, env)`,
  which inserts one `PENDING` row per channel of `configuredChannels(env)` with a pure insert
  and no HTTP call, and `apps/api/src/tickets/report.ts` calls it inside the create transaction
  right after the ticket and its `created` event — the row carries only the machine-readable
  message parameters `{ ticketNo, priority, objectName }` (no photo, no contact data). The
  channel failure can therefore never lose the event; draining the rows with retries
  remains the announced follow-up WP-M7-04c.

  `apps/web/src/features/settings/NtfySubscription.tsx` renders a `qrcode.react`
  card whose QR carries the public subscription address
  `${NTFY_PUBLIC_URL}/${NTFY_TOPIC}` from `docs/DEPLOYMENT.md` — the values are
  component props with a build-time `VITE_NTFY_PUBLIC_URL` / `VITE_NTFY_TOPIC`
  fallback, so no API route exposes them; a `deepLink` switch carries the
  `ntfy://<topic>` payload of the ntfy app instead. The card labels itself with
  the new `ntfy.subscribe`, `ntfy.qrLabel` and `ntfy.appHint` keys of the
  `common` namespace (`de` and `en`) and renders nothing while the channel is
  not configured. The follow-up chain WP-M7-04 (outbox rows in the create
  transaction) and WP-M7-04b (the outbox worker and the localized ntfy action
  label) is planned.

- Every user gets a sortable klarmname (WP-M2-93): the `users` table gains
  `given_name` and `family_name` (`NOT NULL`, default `''`, length ≤ 64, stored
  trimmed) behind migration `0018_user_klarmname`, indexed by `users_name_idx` over
  `lower(family_name), lower(given_name)`. The migration and the base seed derive the
  family name of the bootstrap administrator from the e-mail local part, so a fresh
  deployment has a sortable name without inventing a given name.

- Every user gets a theme in the user management (WP-M2-92e): the create and the
  edit form of `/admin/users` carry a select for `auto` (the system preference),
  `light` and `dark`; the value is stored with the user and the shell applies it.

- The web shell knows a light mode (WP-M2-92d): the theme of the user (`auto`,
  `light` or `dark`) is applied as a class on the shell root, `auto` follows the
  system preference of the browser. The light palette only remaps the Tailwind
  color variables, so every page keeps its colors without a new utility class.

- The theme is part of the user contract (WP-M2-92c): `userThemeSchema` knows
  `auto`, `light` and `dark`, the user summary, the create and update requests
  and the `/me` answer carry it. The admin user API reads and stores the theme,
  so an admin can set the appearance of every user.

- The theme of a user travels through the session (WP-M2-92b): the session user and
  the login response carry the stored `theme` next to the locale, so the web shell
  can apply the user's own appearance.

- Every user gets a theme setting (WP-M2-92): the `users` table gains a `theme`
  column (`auto`, `light` or `dark`, default `auto`) with the check constraint
  `users_theme_check`; migration `0016_user_theme` is part of the journal.

- The ticket detail page (WP-M2-91) shows an always visible action panel below the
  title instead of an "Aktionen" toggle: payload actions carry inline input fields
  (placeholders from the former prompts), missing required values and API failures
  show as an inline alert line, the hard delete confirms by typing the ticket
  number — no `window.prompt`/`alert`/`confirm` dialogs any more. New i18n keys
  `detail.errors.fieldRequired`, `detail.errors.deleteConfirmMismatch` and
  `detail.prompt.deleteConfirmNumber` in de and en.

- The public report form offers the optional short title (WP-M2-90c): with
  `titleEnabled` from the QR resolve the form renders a `Kurztitok (optional)`
  input between the fault chips and the free text, and the submit body (also the
  offline outbox body) carries the trimmed value; without the switch no title
  input exists at all. New i18n key `report.titleField.label` in de and en.

- The branding page gains a `titleEnabled` checkbox (WP-M2-90b): it prefills
  from the branding response, is disabled without `settings.write` and the
  `PUT` body carries the switch together with the company name; new i18n keys
  `branding.field.titleEnabled` and `branding.hintTitleEnabled` in de and en.

- `scripts/update.sh` compares the version of the running `api` container with
  GitHub instead of the folder `VERSION` (WP-M3-16); a folder that is already
  newer than the containers no longer blocks the rebuild.

- A host deploy hook for the update menu (WP-M3-15): `npm run deploy:hook`
  listens for the webhook of the administration, checks the token and starts
  `scripts/update.sh --yes` in the background. Setup in `docs/DEPLOYMENT.md`.

- The update menu of the administration (WP-M3-10): the version badge of the
  shell header is a button for a user with `system.update` and opens a panel
  with the installed version, the installed commit, the newest upstream commit,
  the commits behind it and a button that starts the deployment after an
  explicit confirmation. Every other user keeps the plain version text.

- The update control of the administration is replaced by a GitHub check and a
  deploy webhook (ADR-0007, WP-M3-07 … WP-M3-08): `GET /api/v1/admin/update/check`
  answers the installed version, the newest commit of the branch and the
  commits behind it (cached for a minute), `POST /api/v1/admin/update/start`
  checks again on the server, calls the deploy webhook with the header
  `X-Deploy-Token` and answers immediately — the deployment replaces the API
  container. A second start inside five minutes is refused. The tokens belong
  to the API and never reach the browser.

- The stack carries the configuration of the update control (WP-M3-09): the
  `api` image takes the build argument `GIT_COMMIT` and the tracked `VERSION`
  file, the compose file passes the keys `GITHUB_REPO`, `GITHUB_BRANCH`,
  `GITHUB_TOKEN`, `UPDATE_WEBHOOK_URL` and `UPDATE_WEBHOOK_TOKEN` to the API
  and gives it `host.docker.internal:host-gateway`, so a deploy hook on the
  host is reachable. `.env.example` documents the keys.

### Changed

- The ticket list shows one line per ticket (WP-M9-21): instead of a card grid every
  ticket is a line — the ticket number and the object on the left, the mini timeline with
  the remaining or overdue time in the middle, the status, the priority and the times on
  the right. The whole line is one link to the ticket detail instead of a link on the
  ticket number only, and the rows come in the deadline order of WP-M9-20, so the nearest
  deadline is on top. Below `md` the line stacks, so the phone shows the same information
  without a horizontal scroll, and the dates follow the language of the interface.

- The ticket list can be ordered by the deadline (WP-M9-20): `GET /api/v1/tickets` with
  `order=deadlineAt` sorts the rows by the deadline in the requested direction and puts the
  open tickets before the finished ones, so the nearest deadline is on top and the list
  does not start with the oldest closed ticket. The ticket number is the tie-breaker, so
  the pages of a long list stay stable.

- The ticket list becomes mobile first (WP-M2-91b): instead of a wide table with
  horizontal scrolling every ticket is a card — number and status badge, priority,
  object and object number, the mini timeline with the remaining time and the
  reported time, then the link to the ticket. One column on the phone, two from
  `sm` and three from `xl`; status and priority are read from the i18n keys now
  (the hardcoded German labels are gone) and the list controls get 44 px touch
  targets.

- The update menu tells the failures of a start apart (WP-M3-14): a refused
  webhook, an unknown answer of the API (with its HTTP status) and a **lost
  connection** — the last one is the normal case of a deployment that replaces
  the API container, so the panel says that the stack is probably restarting
  and offers a reload of the page.
- The router shows a page of the application instead of the developer page of
  React Router (WP-M3-13): an unknown address gets a "not found" page with a
  link to the dashboard, an unexpected error gets an error page, and the
  retired address `/admin/update` leads to the administration home — the update
  menu lives in the version badge of the header.
- The page `/admin/update` and its host update section are gone (WP-M3-10); the
  update lives in the version badge of the header now. The PWA updates itself
  (`registerType: autoUpdate`), so the manual cache control of the old page is
  not needed any more.
- The update agent is retired (WP-M3-11, ADR-0007): the workspace `apps/agent`,
  the compose service `update-agent`, the `agent` target of the `Dockerfile`, the
  environment keys `UPDATE_AGENT_*` and the state volume `update-state` are
  gone. The deployment of the stack is triggered by the webhook of the operator
  (or by `scripts/update.sh` on the host), the application needs no privileged
  container any more. The table `update_runs` stays as the history of the
  retired runs.

- The Dexie outbox learns the offline internal writes (WP-M5-01): a v2 table
  `internal_actions` queues acknowledge, comment and decline with their own
  `client_uuid` idempotency key, replays oldest-first on app start and the
  `online` event and reports both queues through `pendingWrites()`. The rows
  wait for their endpoints (WP-M5-02 … WP-M5-04); nothing sends yet beyond the
  delivery skeleton.
- Phase 5 (offline internal actions) is planned in nine work packages  (WP-M5-01 … WP-M5-09 in `work-packages/m5/`): the Dexie v2 internal action
  queue, the `internal_action_receipts` table with its replay-safe helper, the
  `clientUuid` idempotency on the acknowledge/decline routes plus an internal
  comment route, the offline queue and conflict UI, stale-while-revalidate
  ticket reads, the E2E exit-criterion test and the cache clear on sign-out.
  No product code yet — this is the split required by `PLAN.md` §16/§17.
- The update agent removes the images it replaces (WP-M3-02b): it snapshots the
  image ids of the three owned image names before the compose rebuild, removes by
  id whatever neither a current tag nor a container of the compose project needs
  and keeps the project-labelled `docker image prune -f` as the last best-effort
  command. It never runs an unscoped prune; `--gc` remains a property of
  `scripts/update.sh`.
- Admins can permanently delete cancelled tickets (`ticket.delete`,
  `DELETE /api/v1/tickets/:ticketNo`): the deletion is recorded in the
  append-only `ticket_purges` log and the ticket's photos are removed from the
  uploads volume; the ticket detail page shows an "Endgültig löschen" button
  once a ticket has been storniert (WP-M2-75 … WP-M2-78).
- The host update page shows the comparison of the built-in version and the
  newest GitHub tag (WP-M2-74). If the agent knows no checkout version, the
  version of the web app is used; an unparseable version is named instead of
  claiming the latest version. The run button only appears when the agent is
  reachable; otherwise the page carries a one-time command that discovers the
  compose project and its directory from the running web container.
- A panel deployment without git metadata now builds the current sources
  (WP-M2-73): the agent and `scripts/update.sh` set `IMAGE_BUILD_CONTEXT` to the
  repository URL when `.env` has no Git build context, so a synced project
  folder cannot rebuild the old files and report success.

- The host update runs as a shell script without the agent (WP-M2-72):
  `sh scripts/update.sh` compares `VERSION` with the newest GitHub tag, pulls a
  git checkout or lets the compose build fetch the sources in a panel
  deployment, rebuilds the running stack and prunes the old images. The admin
  page now points to that command; the update agent remains optional for the
  in-UI button.

- The host update works in panel deployments (WP-M2-71): without a git work
  tree the pull step is skipped instead of failing the run, so an Arcane project
  folder updates through the compose build. The agent reads the compose project
  from its own container label (no second stack), keeps running optional
  profiles such as `backup`, never recreates itself through the `update`
  profile, and prunes only the dangling images of its own project.

- The host update page shows the raw failure detail (WP-M2-70): below the
  translated error code of the last run, a scrollable monospace block renders the
  sanitized output tail stored by the agent; no block appears when the run has
  no detail.
- A host update names why it failed (WP-M2-68, WP-M2-69): the update agent keeps
  the output tail of the failing step — stderr first, control characters dropped,
  every credential redacted and cut to `UPDATE_ERROR_DETAIL_MAX_CHARS` — and the
  API stores it in `update_runs.error_detail` (migration
  `0011_update_runs_error_detail`) and answers it with the last run.

- The object list shows the system type (WP-M2-66): a new `Typ` column renders the
  category derived from `external_type` as a quiet badge whose title carries the stored
  BMAcloud name; a locally maintained object shows a dash instead.

- The BMAcloud sync writes the system type (WP-M2-65b): every run fetches the
  `GET /anlagentypen` reference list best-effort and stores the resolved type name in
  `objects.external_type`; an unknown `typ` stays `null` and a failed reference call leaves
  the stored name untouched instead of clearing it.

- The BMAcloud contract knows the system type (WP-M2-65): `bmaAnlageSchema` reads
  the `typ` id, `GET /anlagentypen` resolves it to a name and
  `externalTypeCategory()` classifies the German type keywords into `BMA`, `LICHTRUF`,
  `RWA`, `EMA` and `SPRACHALARM` — an unknown name stays `null`, no `SONSTIGE` guess.

- The host update section checks for a newer version (WP-M2-63): „Update prüfen“
  reads the newest StörDesk release from GitHub, offers „Jetzt updaten“ when that
  version is newer than the running one and reports „Sie nutzen die neueste
  Version“ otherwise; a failed lookup never blocks the manual update.
- Every object answer of the API carries the read-only `externalType` (WP-M2-64):
  `objects` gains the nullable `external_type` behind migration
  `0010_object_external_type` — the human-readable system type name of an externally
  maintained object; locally created objects keep it `null` and the create/update
  inputs never accept it.
- The host update works without a configured secret (WP-M2-59, WP-M2-60): the
  agent creates its own bearer and writes it into the state volume, the API
  mounts that volume read-only and reads the value there. `UPDATE_AGENT_TOKEN`
  in the `.env` is optional and only pins a fixed bearer — the operator has to
  configure nothing.
- The administration carries the guide for the host update (WP-M2-61): while the
  agent does not answer, the section shows the two steps and the command that
  starts it on the host, with a button that copies it to the clipboard.

- The host update page names why the agent is not reachable (WP-M2-57,
  WP-M2-58): the status of the API carries the cause — the token
  `UPDATE_AGENT_TOKEN` is missing in the `.env` of the host, the agent answered
  something invalid, or the agent does not run. The page shows the matching
  text; the last one names the command that starts the agent.
- The host update section in the admin update page (WP-M2-55): `/admin/update` shows
  the state of the update agent, the version on the server and the last run, and starts
  a host update with an explicit confirmation — a confirm step, never a password. The
  section is hidden without the permission `system.update`; the guard of the server
  stays the only enforcement point. During the rebuild the API is briefly unreachable,
  and the page says that instead of failing.
- The admin update API (WP-M2-54): `GET /api/v1/admin/update/status`,
  `POST /api/v1/admin/update/run` and `GET /api/v1/admin/update/runs`, guarded
  with the new permission `system.update`. The API stays a client: it calls the
  agent over the internal network with the bearer `UPDATE_AGENT_TOKEN` and
  validates every answer, so a malformed answer becomes an error and never a
  crash. A run is written before the agent starts — the rebuild replaces the
  API container — and a `RUNNING` row is reconciled with the state of the agent
  after the restart. A second run is refused with `409`, a run inside the
  cooldown with `429`.
- The compose invocation of the agent and its image in the smoke test
  (WP-M2-53b): the compose client of the agent runs in the project directory,
  so it reads the `.env` of the checkout and therefore the project name of the
  host — without it the agent would deploy a second stack next to the running
  one. The smoke test builds the image of the agent, so CI proves that the
  Alpine packages for `git` and the Docker CLI exist.
- The image, the compose service and the environment of the update agent
  (WP-M2-53): the image `stoerdesk-agent` is `node:22-alpine` with `git`,
  `docker-cli` and `docker-cli-compose`; the service `update-agent` lives
  behind the compose profile `update`, so the normal `docker compose up -d
--build` never touches it and the agent survives the redeploy it triggers. It
  is mounted with the checkout, the Docker socket and a state volume, listens
  only on the internal network and publishes no host port. `npm run env:create`
  generates the bearer `UPDATE_AGENT_TOKEN`.
- The update agent HTTP server (WP-M2-52): the agent speaks three paths —
  `GET /status`, `POST /run` and `GET /runs` — on the internal network only,
  behind the bearer `UPDATE_AGENT_TOKEN`, which is compared in constant time
  over the digests. Without a web framework, so the agent image stays free of
  runtime dependencies; a request carries no command, no path and no argument.
  The last run is written to the state file of the agent, so a restart of the
  agent does not lose it.
- The update agent service core (WP-M2-51): the new workspace `apps/agent` holds the
  logic of a host update — `git pull` → `docker compose up -d --build` → `docker image
prune -f` — with the command runner injected, so the whole logic is tested without a
  shell and without a Docker daemon. A run knows three steps and three error codes, never
  the output of a command, and the owner of the checkout is restored after the pull.
- The `update_runs` table (WP-M2-50): one row per host update — status, the
  versions before and after the pull, the error code and the id of the agent run,
  so a run stays visible in the administration after the restart of the API.
  Migration `0009_update_runs`.
- Permission `system.update` and the update schemas (WP-M2-49): the new key belongs
  to the role `admin` only — a host update is a deployment decision. `@stoerdesk/shared`
  exports the schemas of the update contract (the run row, the agent status, the answers
  of the admin routes), so the API and the update agent speak one protocol.
- Host update agent — decision and work plan (WP-M2-48, ADR-0006): stage 2 of the
  self-update runs the real host update (`git pull` → `docker compose up -d --build` →
  `docker image prune -f`) without giving the `api` container any host access. The agent is a
  service of the **same** compose project behind the profile `update`, so the normal
  `docker compose up -d --build` never touches it and it survives the redeploy it triggers; it
  is mounted with the checkout and the Docker socket, listens only on the internal network
  behind the bearer `UPDATE_AGENT_TOKEN` and decides itself what a run is. The chain
  WP-M2-49 … WP-M2-56 implements the contracts (`system.update`), the `update_runs` table, the
  agent, its image and compose wiring, the admin API, the page section and the documentation.
  `specs/18-self-update.md` §18.4–§18.6 now describe the topology and the agent protocol.
- API-key field on the BMAcloud sync page (WP-M2-47): `/admin/bma-sync` shows the effective
  source (`db`, `env` or `none`), a write-only key field, `Schlüssel speichern` / `Save key`
  and — only for a stored key — `Gespeicherten Schlüssel löschen` / `Delete stored key`. The
  field is gated on `object.import`, never prefilled and never echoed back; after save the
  credentials query refreshes to the stored source.
- The scheduled BMAcloud pull resolves the same key as the manual trigger (WP-M2-46): one
  startup read of the `bma.api.key` row with `BMA_API_KEY` as fallback decides whether the
  `bma-anlage-sync` queue is scheduled at all, and every run reads the key again — a key
  stored or removed on the admin page takes effect without an API restart. Without a key in
  either source the job still refuses to start and logs only the fixed reason.
- BMAcloud bearer key configurable in the administration (WP-M2-45, ADR-0005): the key
  may now live in the `settings` row `bma.api.key` and wins over the `BMA_API_KEY`
  environment, so an image-based deployment that cannot edit `.env` is no longer stuck
  on `bma_not_configured`. New admin routes `GET`/`PUT`/`DELETE
/api/v1/admin/bma-sync/credentials` — the status answers `{ configured, source }`
  (`db` / `env` / `none`) only, the stored key is never echoed, never logged and never
  written into a run row. ADR-0005 supersedes only the credential rule of ADR-0003; the
  read-only client and the `object.read` / `object.import` guards stay. The key field on
  the sync page followed in WP-M2-47.
- Self-update decision and spec (WP-M2-43, ADR-0004): the admin update control is
  an out-of-band host update agent, never shell execution in the `api` container
  and never an OS/Linux password. Stage 1 is implemented as a client-only clean PWA
  update on the guarded `/admin/update` page (WP-M2-44): it shows the app and
  service-worker versions, checks for a waiting worker, activates it with
  `SKIP_WAITING`, can clear PWA caches and blocks reload/cache-clear while the
  offline outbox still has queued or sending reports. Stage 2 (agent container on the
  Docker socket, `UPDATE_AGENT_TOKEN`, an `update_runs` table and a `system.update`
  permission) stays planned. New `specs/18-self-update.md`.

### Fixed

- The milestone markers of the ticket timeline sat above the bar instead of on it: the
  report marker (`created`) was a half dot floating over the start point of the axis,
  because the markers were drawn inside the clipped box of the bar. The markers now live
  in an overlay next to the bar — every dot is a whole circle centered on its own time
  position and on the bar, so the report marker sits on the start point of the axis. The
  tooltip names the milestone in the language of the interface ("Meldung eingegangen ·
  09.11.26, 08:00") instead of the machine key and the raw ISO string, the tick of the
  deadline is no longer clipped at the end of the axis, and the numbers of the scale start
  and end with the axis (WP-M9-22).

- The iCal token test was flaky: the "tampered" signature replaced the last character of
  the base64url HMAC with `A`, but that character carries only four significant bits, so in
  about one of sixteen runs the tampered token was byte-identical to the valid one and the
  route answered `200` instead of `404` (this is what failed the check run `v1.0.115`). Both
  tests now tamper with the first character of the signature, which always changes the
  signature; the assertion itself is unchanged.

- The settings gear and the administration home did not link every available page:
  the menu now carries "Fristen" (`/admin/deadlines`) and an explicit "Meine
  Einstellungen" (`/settings/me`) entry in a new personal group, and the
  administration home links "Darstellung" (`/admin/branding`) after the on-call
  module. The administration menu order now matches the module order of the
  administration home.

- `generateOncallSlots` produced wrong UTC instants when the process time zone was
  not UTC: it read the zoned wall clock with `getUTC*` while `fromZonedTime` reads the
  candidate's local fields, so under the shipped `TZ=Europe/Berlin` every slot moved
  by the UTC offset and the 167/169-hour DST weeks came out wrong. The generator now
  uses local getters and `setDate`, making the DST rule independent of `TZ`
  (WP-M8-16).

- The ticket workflow E2E timed out clicking the top-right options button of the
  ticket detail (`getByRole('button', { name: /Optionen|Options/ })`). The button now
  carries `data-testid="ticket-options-button"` and the workflow E2E targets it by test
  id instead of the localized accessible name, waits for network idle after navigating
  to the ticket detail, and only opens the options menu when it is not already open —
  `performAction` previously toggled the menu and closed it on the second workflow step,
  hiding the action entry ('Annehmen' / 'Accept'). Both `de` and `en` runs of
  `full ticket workflow with audit trail` pass again.
- The ticket workflow E2E asserted the localized actor kind of the audit trail with
  `getByTestId('ticket-history').locator('.text-xs.text-slate-400')` against a single
  text: all seven history rows carry those classes, so the strict-mode locator
  resolved to seven elements and both locale runs of the test aborted. The
  expectation is an array now — one localized `actorKind.user` label per element —
  with a `toHaveCount(7)` guard, and the history must not contain the raw
  `actorKind.` key any more. The check runs of the versions v1.0.7 and v1.0.8 stay
  red: they predate the repair, and a published tag cannot be changed afterwards.
  The working build is the version v1.0.9.
- The ticket workflow and the offline internal E2E expect the labels of the
  internal detail page again: the status badge and the history rows render
  `status.values.*` and `status.events.*`, so the six Playwright tests of
  `workflow.spec.ts` and `offline-internal.spec.ts` that searched for the raw
  event types — and for the German status labels in the English run — failed.
  The badge and the history carry a test id now, so every expectation is scoped
  to its own element, and the English run uses the English labels. The check runs
  of the versions v0.1.173 … v0.1.195 and v1.0.0 stay red: they predate the
  repair, and a published tag cannot be changed afterwards. The working build is
  the version v1.0.1.
- The self-update groundwork for the step deadline (WP-M3-05): the shared update
  schema now carries the fixed error code `update_step_timeout`, the spec §18.4
  records the deadline rule and `/admin/update` labels the code in de and en.
- The update agent no longer stays `running` forever (WP-M3-06): every run
  step (`git pull`, `docker compose up -d --build`, the image clean-up) runs
  against `UPDATE_STEP_TIMEOUT_MS` (default ten minutes). When a step passes
  its deadline, the run fails with `update_step_timeout`, reaches
  `finishedAt` and shows the error instead of staying `Läuft` endlessly.
- The ticket detail page reaches the workflow routes: every action event is
  mapped to its API route segment (`/review`, `/work-order`, `/assign`, …)
  instead of posting the internal event name, and the JSON content type is only
  sent together with a body (Fastify rejects an empty JSON body with 400). The
  WP-M4-01 workflow E2E, whose CI check runs v0.1.123 … v0.1.125 were red, now
  drives every transition through the "Actions" panel and passes 10/10 against
  a real database and Chromium.
- The start command of the update button runs in the project folder and no longer
  follows a container-internal path (WP-M3-03, WP-M3-04). It used the
  `com.docker.compose.project.working_dir` label of the running web container as
  a host path, but that label names the folder as the machine that ran compose
  saw it: a panel such as Arcane runs compose inside its own container, so the
  label says `/app/data/projects/<project>`, the host does not know that path and
  the copied command failed with `cd: …: No such file or directory`. The command
  now keeps only the project name from the `com.docker.compose.project` label,
  pins the folder it is copied into with `--project-directory "$PWD"` and stops
  guessing directories.
- A panel deployment without a project `.env` can start the update agent
  (WP-M3-04): the compose file requires `POSTGRES_PASSWORD` and `SESSION_SECRET`
  and the `api` service declares `env_file: .env`, so compose failed before the
  agent started. The start command now appends only the missing keys to `.env`,
  reading every value inside the running `api` container with `printenv` (never
  on the host command line), creates the file under `umask 077` and never
  rewrites an existing secret.
- Der Startbefehl bricht ab, wenn er nicht im Projektordner liegt (WP-M3-04b):
  fehlt die `docker-compose.yml` im aktuellen Verzeichnis, endet der Befehl mit
  `exit 1` und einer klaren Meldung, bevor Compose oder die `.env` angerührt
  werden.
- The permanent ticket deletion typechecks again (WP-M2-77): `tickets` has no
  `object_no` column, only the `object_id` foreign key, and the deletion used
  `sql` without importing it. The object number that `ticket_purges` requires is
  now selected through the object of the ticket — objects are only soft-deleted,
  so that join always finds the row.
- The host update script no longer leaves an untagged image behind on every
  update (WP-M3-02). `docker compose up -d --build` moves the fixed
  `stoerdesk-{api,web,agent}:latest` tags to the new images, so the previous
  image of each service turns tagless; the only cleaner was `docker image prune
-f --filter label=com.docker.compose.project=<project>`, and that filter finds
  a tagless image only when the build wrote the label into it. Builds from a
  remote build context (`IMAGE_BUILD_CONTEXT`, the Arcane path), the
  `docker-compose` v1 fallback the script accepts and every aborted build carry
  no such label, so each of them left a `<none>` image on the host.
  `scripts/update.sh` now snapshots the image ids it owns before the rebuild —
  `STOERDESK_OWN_IMAGES` plus the Compose default names of the project — and
  afterwards removes by id whatever is neither the current image of one of its
  names nor the image of a container of this project (`docker rmi` without `-f`,
  so an image still held by a container stays), also after a failed rebuild. It
  adds `--remove-orphans`, never runs an unscoped `docker image prune -f`, and
  gains `--cleanup` (no pull, no rebuild) plus `--gc` (`STOERDESK_GC_UNTIL`,
  default 168 h) for the backlog of tagless images and build cache an older
  version left behind. The update agent keeps its label-only prune until
  WP-M3-02b ports this to it.
- The background-sync queue of the service worker matches the public report path
  through its API base (WP-M3-01): the route compared the bare `/v1/public/tickets`
  while the app requests `/api/v1/public/tickets`, so the queue never matched. The
  predicate now lives in `apps/web/src/lib/sw-routes.ts` and is unit-tested; the Dexie
  outbox, the online path and the API are unchanged. The phase 3 closure also filled
  the previously placeholder `specs/09-offline.md`.
- The public report E2E smoke tests use the live fault catalog label `Line interruption`
  in English. The old expectation still waited for `Fire alarm system completely out of
service`, which the bootstrapped standard fault types no longer offer.
- The version of the web shell reads the nearest **version** tag only. A moving pointer
  tag such as `latest` is not a version and must neither become the version in the
  header nor break the quality gate: the check run of the release `v0.1.0` failed
  because `git describe` answered `latest` instead of the version tag.
- The promotion of the `latest` image tag runs in a job of its own and the promotions of
  one image are serialised (concurrency group `latest-<image>`). Without that, two
  parallel publish runs could write `latest` in the wrong order and move it back to an
  older version.
- The publish chain of the GitHub Actions no longer loses a version and no longer
  leaves `latest` behind. A queued publish run was cancelled when a newer publish run
  was queued (the versions `v0.0.87` and `v0.0.97` never reached the registry),
  because all publish runs shared one concurrency group; every version now has its
  own group. `latest` was written by every build, so the version that happened to
  finish last won and `latest` pointed to `v0.0.98` while `v0.0.99` was already
  published; the build writes only the version tags now and a promotion step points
  `latest` at the newest version that exists in the registry.
- The version in the web shell is the application version produced by the development
  workflow. The pre-commit hook writes the next version into the tracked `VERSION` file,
  the post-commit hook tags exactly that value, and image builds read it without git
  metadata or an `.env` entry; the misleading `VITE_APP_VERSION` name and the manual
  `env:version` refresh are gone.

### Changed

- The phase 2 record is closed. Commit `a6804ed` landed the BMAcloud contract
  (`specs/17-bmacloud-sync.md`, ADR-0003, the `PLAN.md` §11 block) without a work package
  and without a WP id in its subject, and it committed a stray test file at
  `apps/web/apps/web/src/__tests__/diag.test.tsx`, outside the source tree. `WP-M2-32`
  records that commit, deletes the stray file and announces the implementation as
  `WP-M2-33` … `WP-M2-39` — the commit wrote no client, no `bma_sync_runs` table, no
  `BMA_*` environment key, no route and no page, so `PLAN.md` §11 is documentation until
  that chain runs. The stale `status:` lines of the `m2` documents `09` … `31` now say what
  the code already does, and the stale `Follow-up WP:` line of `WP-M2-26` is corrected: it
  named a work-package file that never existed.
- The phase 1 record is complete. Seven phase 1 commits had landed without a work
  package — `3e1c0f8` (centred login card and version display), `71fd066` (RBAC and
  administrator bootstrap on API start), `f0e0fcc`, `1d56aad` and `d994911` (PostgreSQL
  service in the `check` job, the dead Playwright job, the publish queue),
  `4da1c7b`/`ad0b45b` (configurable login rate limit) and `7e64dd1` (the end-of-session
  commit rule). `WP-M1-23` … `WP-M1-27` are the retroactive work-package documents for
  them, and every `m1` work-package document now carries a `status:` line.
- `.env.example` documents `LOGIN_RATE_LIMIT_MAX` and `LOGIN_RATE_LIMIT_WINDOW`; the API
  environment has had both since `ad0b45b`, but the template of `PLAN.md` §15 was missing
  them.

### Added

- The external-maintained badge in the object list (WP-M2-39): a row whose `external_id` is
  set carries a quiet "extern gepflegt" / "externally maintained" badge next to the object
  number, with a `title` naming BMAcloud and the overwrite rule. The badge is independent of
  the active badge and neither is colour-only. The object list had no page test before, so
  the WP adds one. With this the BMAcloud chain WP-M2-32 … WP-M2-39 is complete.
- The BMAcloud sync card on the administration home (WP-M2-38): `MODULES` gains
  `bmaSync` → `/admin/bma-sync` directly after the roles card, labelled
  "BMAcloud-Abgleich" / "BMAcloud sync" and saying that the object list is pulled
  read-only. The admin home had no page test before, so the WP adds one covering the
  new card and the planned badge.
- The BMAcloud sync page in the administration (WP-M2-37): `/admin/bma-sync` lists the run
  history with the localized status label (never colour alone) and the five counters, shows
  the conflicts of the newest run, triggers a manual pull with "Jetzt abgleichen" and carries
  the schedule form, prefilled from the stored or effective pair. The trigger needs
  `object.import`, the schedule needs `object.write`, and `bma_not_configured`,
  `bma_request_failed`, `bma_bad_response` and `invalid_request` answer localized hints.
- `GET /api/v1/admin/bma-sync/schedule` (WP-M2-36b): the admin page of WP-M2-37 prefills
  its schedule form, and the effective pair — the stored `bma.sync.enabled` /
  `bma.sync.cron` settings with the `BMA_SYNC_*` environment as fallback — was not
  readable anywhere. The route is guarded by `object.read` and answers the existing
  `bmaSyncScheduleResponseSchema`; it closes the open question of WP-M2-36.
- The standard fault types are bootstrapped into `text_templates` when the API
  starts (WP-M2-42): the eight texts with their `de`/`en` row, marked as done in
  `settings`, so a deleted type stays deleted and an edited translation is kept.
- The fault type administration (WP-M2-40 … WP-M2-40f): the eight standard fault
  types of the report form are bootstrapped in `text_templates`, an administrator
  creates, edits, archives and deletes them at `/admin/text-templates`, an archived
  type keeps labelling existing tickets but leaves the form, and a type that a ticket
  carries cannot be deleted (`409 text_template_in_use`). The forms read the catalog
  from the API instead of a compile-time list.
- The BMAcloud admin API and scheduled sync job (WP-M2-36): the guarded admin routes
  `GET /api/v1/admin/bma-sync/runs`, `POST /api/v1/admin/bma-sync/run` and
  `PATCH /api/v1/admin/bma-sync/schedule`, the effective schedule from the
  `bma.sync.enabled` and `bma.sync.cron` settings with `BMA_SYNC_*` fallback, and a
  pg-boss job that starts only when `BMA_API_KEY` is present.
- The BMAcloud mapping and sync service (WP-M2-35): `mapAnlage` per §17.3, and
  `syncBmaAnlagen` that matches objects by `external_id` then `object_no`,
  reports `object_no_taken` instead of overwriting a local object, soft-deactivates
  objects that disappeared from the pull and records every run with its counters.
- The `bma_sync_runs` table behind migration `0007_bma_sync_runs` (WP-M2-34): one row per
  BMAcloud pull with the status check `RUNNING`/`SUCCESS`/`PARTIAL`/`FAILED`, the five
  counters, the conflicts as jsonb and an index on `started_at` for the run history.
- The read-only BMAcloud client of the object sync (WP-M2-33): `GET /anlagen` and
  `GET /anlagen/{aid}`, a hard-coded `GET` in the private request helper (the write
  endpoints stay unreachable), `BMA_API_BASE_URL` / `BMA_API_KEY` / `BMA_SYNC_ENABLED` /
  `BMA_SYNC_CRON` in the environment schema and `.env.example`, and `bma_not_configured`
  before any request when the key is empty. The key never reaches an error message or a log.
- The administration pages `/admin/users` and `/admin/roles` carry a quiet back link to the
  administration home `/admin` (WP-M2-26), labelled `settings:admin.back` in `de` and `en`.
- The duplicate hint of the public report form. The form asks the API for the open
  tickets of the object and offers the two answers of the plan: "Ergänzen" appends the
  text of the reporter to the open ticket as a public comment event, "Trotzdem neu
  melden" creates a new ticket that points at the open one (`tickets.parent_ticket_id`).
  The QR token of the object is the capability of the public comment, so the status
  token of a foreign ticket is never handed out.
- `npm run release:push` pushes the current branch and every version tag the remote does
  not have yet, one tag per push. GitHub creates no tag push event when more than three
  tags are pushed at once, so a batch push of several tags left the older commits without
  a check run and without published images (`v0.0.93`, `v0.0.94`, `v0.0.95`).
- Monorepo skeleton with npm workspaces (`apps/web`, `apps/api`, `packages/shared`).
- Configuration: TypeScript strict, ESLint (flat config, i18next rule), Prettier,
  Vitest (root and per workspace), Husky, commitlint.
- Scripts: `npm run check`, `npm run i18n:check`, `npm run spec:split`,
  `npm run orchestrate`, `npm run wp:check`.
- Docker setup: `Dockerfile` (targets `api`, `web`), `docker-compose.yml`,
  `docker-compose.dev.yml`, `.env.example`.
- CI: `.github/workflows/check.yml` (Node 22, `npm ci`, `npm run check`).
- Specification structure `specs/` (17 chapter files), work packages
  `work-packages/m1` (12) and `work-packages/m2` (10), documentation `docs/`
  including REPO-MAP and ADR-0001.
- WP-M1-03: Drizzle base schema `apps/api/src/db/schema.ts` with `users`,
  `sessions`, `groups`, `user_groups`, `settings`; UUID v7 as server-side default
  via `gen_uuid_v7()` (ADR-0002), migration `0000_base_tables`, Drizzle client.
- WP-M1-03: migration test (without DB) and integration test against a real
  PostgreSQL 16 database (`TEST_DATABASE_URL`, disposable database per run,
  skipped without a reachable DB).
- Complete Compose stack: `db`, `api`, `web` and the optional `backup` profile
  (`pg_dump`).
- `.env.example` with every variable and explanation; `npm run env:create`
  creates `.env` with generated secrets, so the Compose file never has to be
  edited.
- Persistent volumes for database, uploads and backups; all volume names are
  configurable.
- Notification channels talk only to existing instances (ntfy server,
  signal-cli bridge, Matrix homeserver, SMTP, Telegram); StörDesk ships no
  notification servers. A channel stays disabled while its address is empty.
- `docs/DEPLOYMENT.md`: deployment, volumes, backups/restore, notification
  channels.
- `PLAN.md`: binding build plan with scope, stack decisions, phases, small-model
  work-package limits, acceptance summary and open decisions.
- `docs/WP-TEMPLATE.md` and `scripts/wp-check.mjs`: template and validation for
  work packages that fit a 64k–128k context model.
- Phase 0 work packages in `work-packages/m0/` for local startability, Compose
  resilience, plan anchoring and a Docker smoke test.
- `docker-compose.debug.yml`: optional override that publishes the API host port
  for direct curl and monitoring.
- `scripts/docker-smoke.sh` (WP-M0-04): repeatable Docker smoke test — builds the
  images from the checkout, starts the stack in an isolated Compose project with
  its own volumes and web port `3180`, checks `/healthz` and `/api/v1/health`,
  asserts that the API publishes no host port and removes everything again. Runs
  as the CI job `docker-smoke`, which skips on runners without Docker.
- WP-M0-05: `.github/workflows/build.yml` (`build and push`) publishes the
  versioned `api` and `web` images to GHCR after the `check` workflow succeeded;
  it requires an exact `vMAJOR.MINOR.PATCH` tag at the pushed commit and tags the
  images with the version, the version without `v`, the commit SHA and `latest`
  on `main`.
- `specs/01-rbac.md`: filled RBAC slice (chapters 3 + 4.1) — role model, effective
  permission rule, 37-key catalog, role–permission matrix and the RBAC tables,
  taken from `PLAN.md` §5/§6.
- WP-M1-05: permission catalog of 37 keys plus `DEFAULT_ROLES` for the five system
  roles in `packages/shared/src/permissions.ts`; RBAC tables `roles`,
  `permissions`, `role_permissions`, `user_roles`, `user_permissions` with
  migration `0001_rbac_tables` and the `protect_system_roles()` trigger that
  blocks `DELETE` of system roles.
- WP-M1-05: idempotent seed `apps/api/src/db/seed-rbac.ts`
  (`npx tsx src/db/seed-rbac.ts`) — upserts the catalog and the five system roles,
  rewrites their grants, leaves custom roles and `user_permissions` untouched.
- WP-M1-05: catalog/`DEFAULT_ROLES` unit tests and the integration spec
  `apps/api/src/db/__tests__/rbac.integration.spec.ts`; the CI `check` job now
  provides PostgreSQL 16 as a service, so the database integration tests run
  instead of skipping.
- WP-M1-06: Argon2id password hashing in `apps/api/src/auth/password.ts`
  (`hashPassword`, `verifyPassword` — a malformed stored hash never throws) with
  the `argon2` library, whose prebuilds cover glibc and musl, so the
  `node:22-alpine` API image needs no compiler toolchain.
- WP-M1-06: idempotent bootstrap administrator `apps/api/src/db/seed-base.ts`
  (`npx tsx src/db/seed-base.ts`) from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`,
  linked to the system role `admin`; existing accounts keep their password hash,
  locale and `active` flag, and the CLI output never contains an e-mail or a
  password. `SEED_ADMIN_*` is validated as a pair (valid e-mail, password of at
  least 12 characters) and documented in `.env.example`; seed order is
  migrate → `seed-rbac` → `seed-base`.
- WP-M1-06 (plan): the legacy WP-M1-06 scope was split — the `objects`, `systems`,
  `text_templates` tables and the demo data moved to the new
  `work-packages/m2/00-core-tables-seed.md` (WP-M2-00, phase 2 per `PLAN.md` §16),
  and WP-M2-01 now depends on it.
- `specs/01-rbac.md` §3.6: session and `me` endpoint decisions for WP-M1-07, taken
  from `PLAN.md` §4 (Auth) and §15 (Security) — cookie name/attributes, token hash
  in `sessions.token_hash`, single `401` for unknown e-mail/wrong password/inactive
  accounts, login rate limit, delete-on-read of expired rows, the `me` payload and
  the phase 1 CSRF stance.
- WP-M1-07 (plan): the legacy auth package was rewritten into the small-model format
  and split, because it would have written six source files (`PLAN.md` §17 allows
  3–4): **WP-M1-07** keeps the shared login/me schemas and the session core, the new
  **WP-M1-07b** (`work-packages/m1/07b-auth-routes.md`) holds the session plugin, the
  `requireUser` preHandler and the login/logout/me routes. WP-M1-08 now depends on
  WP-M1-07b and references §3.2/§3.6 instead of the non-existent §3.7.
- WP-M1-07: session core `apps/api/src/auth/session.ts` — the cookie holds a 256-bit
  base64url token, the database holds only its SHA-256 hash in `sessions.token_hash`;
  `createSession`, `loadSession`, `destroySession`, `loadUserRoleKeys` (role keys read
  per request) and `sessionCookieOptions` from `COOKIE_SECURE`/`COOKIE_SAME_SITE` with
  `httpOnly` always on. Expired rows are deleted on read, and a session of a
  deactivated account is no session at all.
- WP-M1-07: shared auth schemas `packages/shared/src/schemas/auth.ts` —
  `loginRequestSchema` (normalized e-mail, capped password length) and
  `meResponseSchema` (`id`, `email`, `locale`, role keys); unit tests for token, hash
  and cookie attributes, plus the integration spec for create/load/expiry/logout,
  inactive account and role keys.
- WP-M1-07b: auth HTTP layer in `apps/api/src/auth/` — `sessionPlugin.ts` decorates
  `request.user` from the `session` cookie (`onRequest`, roles read per request) and
  exports the preHandler `requireUser` (`401` `session_invalid`); `routes.ts` serves
  `POST /api/v1/auth/login` (Argon2id verify, decoy hash for unknown e-mails so the
  response time does not leak accounts, one `401 invalid_credentials` for unknown,
  wrong-password and deactivated logins, route-level rate limit `5` per minute and
  IP), `POST /api/v1/auth/logout` (`204`, session row deleted, cookie cleared) and
  `GET /api/v1/me`. `src/index.ts` owns the database pool (`onClose` releases it),
  registers the plugin and the routes, and maps thrown envelope errors to
  `{ code, params }` — `@fastify/rate-limit` throws the builder result, so the
  `429 rate_limited` body needs that handler. New API dependency `fastify-plugin`.
- `specs/01-rbac.md` §3.7: permission guard decisions for WP-M1-08 — the effective
  permission service (role union plus allows minus denials, denial wins), the
  per-request cache, `requirePermission` with OR semantics and its `401`/`403`
  codes, the `permissions` array in `/me`, and the probe route that is registered
  only when `NODE_ENV=test`.
- WP-M1-08 (plan): the legacy guard package was rewritten into the small-model
  format (`work-packages/m1/08-require-permission.md`) — it now names its four
  source files (guard, `/me` route, `index.ts`, shared `me` schema), the read set,
  the interfaces and the required test cases.
- WP-M1-09 (plan): the legacy admin UI package was rewritten into the small-model
  format and split. WP-M1-09 now covers only the admin user API; the role API,
  `usePermission`, the admin users UI and the admin roles UI become follow-up
  packages WP-M1-09b–WP-M1-09d.
- WP-M1-08: effective permissions and the only enforcement point of the API in
  `apps/api/src/auth/requirePermission.ts` — `loadEffectivePermissions` resolves
  the union of the role permissions plus the explicit `allow` rows of
  `user_permissions` and drops every key with a `deny` row (denial wins,
  `specs/01-rbac.md` §3.2) as two queries, returning sorted catalog keys through
  `isPermissionKey`. `effectivePermissions(request, database)` caches that promise
  on the request, so several guards in one request mean one resolution while a
  role or permission change still acts without a new login.
- WP-M1-08: `requirePermission(database, ...keys)` preHandler factory with OR
  semantics — `401 { code: 'session_invalid' }` without a session (authentication
  before authorization), `403 { code: 'forbidden', params: {} }` without a
  matching key, unknown keys never match. `permissionProbeRoutes` registers
  `GET /api/v1/_test/require-permission/:keys` (comma-separated keys) in
  `src/index.ts` only when `NODE_ENV=test`; verified `404` in development.
- WP-M1-08: `meResponseSchema` gains the effective `permissions` array, so login
  and `GET /api/v1/me` answer role keys plus permission keys; the integration spec
  `apps/api/src/auth/__tests__/requirePermission.integration.spec.ts` covers
  anonymous `401`, admin role, a user without any role `403`, OR semantics through
  an explicit allow, an explicit denial beating the whole admin union, the sorted
  `permissions` in `/me` and an unknown key.
- WP-M1-09: admin users API in `apps/api/src/admin/users.ts` —
  `GET /api/v1/users` answers user summaries with role keys,
  `POST /api/v1/users` creates a normalized account with an Argon2id hash and
  inserts the requested `user_roles` links in one transaction, and
  `PATCH /api/v1/users/:id` updates locale, active flag, password hash and role
  links. The routes are guarded by `user.read` or `user.write`; duplicate e-mail
  answers `409 email_taken`, unknown role keys answer `422 unknown_role_key`, and
  the last active `admin` cannot be deactivated or un-roled. Shared user Zod
  schemas live in `packages/shared/src/schemas/user.ts`; the integration spec
  `apps/api/src/admin/__tests__/users.integration.spec.ts` covers permission
  guards, list/create/update responses, duplicate handling and the last-admin
  lockout guard.
- WP-M1-09b: admin role API in `apps/api/src/admin/roles.ts` —
  `GET /api/v1/roles` (`role.read`) answers every role with `isSystem`, its sorted
  `permissionKeys` and `userCount`, `POST /api/v1/roles` creates a custom role
  (`is_system = false`) with de-duplicated catalog keys,
  `PATCH /api/v1/roles/:key` replaces the grant set and `DELETE /api/v1/roles/:key`
  removes an unused custom role (`role_permissions` cascade). The write routes are
  guarded by `role.write`; unknown permission keys answer
  `422 unknown_permission_key`, an existing or reserved key `409 role_key_taken`, a
  seeded system role `409 system_role_protected` (the service-level guard of
  `specs/01-rbac.md` §3.5, the DB trigger stays the backstop) and a role still held
  by users `409 role_in_use`. Shared role schemas live in
  `packages/shared/src/schemas/role.ts`, `specs/01-rbac.md` gained §3.8; the
  integration spec `apps/api/src/admin/__tests__/roles.integration.spec.ts` covers
  the guards, the seeded grant counts, create/replace/delete, the protected system
  roles and that a replaced grant set acts in `GET /api/v1/me` without a new login.
- WP-M1-10e: follow-up closure rule — `AGENTS.md` gained the section
  _Open follow-ups (mandatory closure)_ (a split creates its child WP files in the
  same commit, open items are collected with
  `git grep -n "Follow-up WP:\|Open question:" -- work-packages/<phase>/` before a WP
  starts and are implemented in numeric order before the next phase), `PLAN.md` §16
  gained the subsection _Current state and open backlog_,
  `work-packages/README.md` gained the `Open follow-ups` table as the backlog of
  record, and `docs/WP-TEMPLATE.md` gained the `status:` field plus the split-child
  handoff rule. This closes the hole that let WP-M1-09b–WP-M1-09d be overtaken by
  WP-M1-10, WP-M1-10b and WP-M1-10c.
- WP-M1-09c: admin users UI in `apps/web/src/admin/users-page.tsx` —
  `UsersPage` at route `/admin/users` lists users (e-mail, locale, active state,
  role keys) for `user.read` and offers a create form plus per-row editing
  (locale, active, role keys, optional new password) for `user.write`, using the
  role list of `GET /api/v1/roles` for the checkboxes. `apps/web/src/auth/usePermission.ts`
  adds `useMe` (query on `['me']`) and `usePermission` with the OR semantics of the
  server guard; hiding is cosmetic, the API stays the enforcement point. `apiFetch`
  parses the `{ code, params }` error body into `ApiError`, so `email_taken`,
  `last_admin` and the other codes map to `settings:admin.users.errors.*` keys.
  All page text lives in the `settings` namespace (de and en complete).
- WP-M1-09d: admin roles UI in `apps/web/src/admin/roles-page.tsx` — `RolesPage` at route
  `/admin/roles` lists roles (key, system or custom, permission count, user count) for
  `role.read`; `role.write` adds a create form (key plus the `PERMISSION_KEYS` checkbox
  grid), a per-row grant editor PATCHing `/api/v1/roles/:key` and a delete button, while
  seeded system roles stay read-only because the seed rewrites their grants. `apiFetch`
  answers `204 No Content` with `undefined` instead of throwing on the empty body, so
  `DELETE /api/v1/roles/:key` works. The role error codes map to
  `settings:admin.roles.errors.*` keys (de and en complete). The announced follow-up
  WP-M1-09e got its work-package document
  `work-packages/m1/09e-login-form-guard.md`.
- WP-M1-09e: session UI in `apps/web/src/auth` — `LoginForm` posts `/api/v1/auth/login` through
  `useMutation` + `apiFetch<MeResponse>` and writes the response into the `['me']` cache, so the
  guarded area swaps without a second round-trip; unknown e-mail, wrong password and a
  deactivated account all render the same `common:auth.errors.invalid_credentials` notice
  (no account enumeration), a `429` renders `rate_limited`. `LogoutButton` posts
  `/api/v1/auth/logout` and invalidates `['me']`, `['users']` and `['roles']`.
  `RequireSession({ children })` is the parent route of both `/admin/*` routes: loading text
  while `/me` is pending, the login form while it answers `401`, otherwise the children —
  cosmetic only, `requirePermission` stays the enforcement point. `App.tsx` shows the
  signed-in e-mail, the admin links and the logout button. All strings live in the `common`
  namespace under `auth.*` (de and en complete: 80 keys each).
- WP-M1-12: Playwright smoke E2E — `apps/web/e2e/auth.spec.ts` runs the phase 1 exit
  criterion "login as admin works" in Chromium, once with the German UI and once with the
  English one: login form of the seeded bootstrap administrator, the signed-in shell,
  `GET /api/v1/me` answering role `admin` plus `user.read`, and `/admin/users` with the
  seeded row and its role cell. `apps/web/playwright.config.ts` starts the API and the Vite
  dev server (only the dev server proxies `/api`; the nginx path is the Docker smoke test)
  on the E2E-only ports 3174/5174. `scripts/e2e-check.mjs` creates the throwaway database
  `stoerdesk_e2e_<run>` from `TEST_DATABASE_URL`, runs the migrations and both seeds against
  it, runs Playwright and drops it again; missing prerequisites produce one notice and a
  green gate locally, in CI (`CI=true`) they are an error. `npm run test:e2e` is the last
  gate of `npm run check`, and the `check` job installs Chromium with
  `npx playwright install --with-deps chromium` — no extra CI job, because that job already
  provides the Postgres-16 service. `E2E_CHROMIUM_PATH` selects a distribution browser in
  containers that cannot run the bundled build.
- WP-M1-13: UI layout shell — `apps/web/src/components/Shell.tsx` wraps the app in a sticky
  header (app title, signed-in account, logout button), a left navigation with the admin
  routes and a centred main area; the shell shows the login form while `/me` answers `401`.
  `App.tsx` renders the shell, the admin routes are nested below `/` so the shell wraps them,
  and the shell reuses the existing `common` keys (`app.title`, `auth.signedInAs`,
  `auth.links.*`) — no locale file changed.
- WP-M1-14: the base seed keeps an existing administrator untouched again — the bootstrap
  insert uses `onConflictDoNothing` on `users.email` and the status `created`/`existing` is
  decided by looking the user up before the insert. The Argon2id hash is only computed when
  a row is really inserted. The role link to `admin` is still repaired on every run.
- WP-M2-00: core object tables — migration `0002_core_object_tables` adds `objects`
  (user-input `object_no`, unique over `lower(object_no)`, address, contact, nullable
  `qr_token`, `external_id`, `active`, `notes`), `systems` (object FK with `ON DELETE
CASCADE`, type check over `BMA`/`LICHTRUF`/`RWA`/`EMA`/`SPRACHALARM`/`SONSTIGE`, own
  optional `qr_token`), `text_templates` and `text_template_translations` (composite key,
  `de`/`en` check) with the indexes of `specs/02-data-model.md` §4.6.
- WP-M2-00: demo seed `apps/api/src/db/seed-demo.ts` (`npx tsx src/db/seed-demo.ts`) —
  three example objects with one `BMA` system each plus the nine standard text templates
  from the new localized resource `STANDARD_TEXTS` in `packages/shared/src/seed/`;
  idempotent over the natural keys and never overwrites edits, the CLI prints counts only.
- `specs/02-data-model.md` is filled from `PLAN.md` §6 and reviewed: the object list is the
  maintained table, `object_no` is user input, unique case-insensitively, format
  `^[A-Z0-9][A-Z0-9_-]{0,31}$` (e.g. `12345_01`), tickets link by UUID foreign key, and
  external referencing (CSV, object API, stickers) uses `object_no`.
- WP-M2-01: object list CRUD API — `apps/api/src/objects/service.ts` serves
  `GET /api/v1/objects` (search plus the `active`/`city`/`systemType` filters),
  `GET /api/v1/objects/:objectNo`, `POST`, `PATCH /:objectNo` and `DELETE /:objectNo`
  (soft delete, `active = false`). Guards are `object.read`, `object.write` and
  `object.delete`; systems are synced by id; duplicate object numbers answer
  `422 object_no_taken`. The shared Zod schemas live in
  `packages/shared/src/schemas/object.ts`, and `specs/08-objects-api.md` §9.1 is filled
  from `PLAN.md` §11.
- WP-M2-02: QR tokens — `POST /api/v1/objects` now generates a 22-character
  `base64url` token, migration `0003_old_qr_tokens` adds `old_qr_tokens`
  (`token` unique, `expires_at`, object FK cascade),
  `POST /api/v1/objects/:objectNo/regenerate-qr` rotates it and retires the old
  token for 30 days (`blockOldToken: true` blocks it immediately), and the public
  `GET /api/v1/public/qr/:token` resolves current and retired active tokens for
  the web route `/m/:token`. `apps/api/src/objects/qr.ts` owns the routes and
  `generateQrToken()`; the object summary carries `qrToken`. The daily pg-boss
  cleanup and the demo-seed token backfill are WP-M2-02b.
- WP-M2-02b: QR token lifecycle — `apps/api/src/jobs/qr-cleanup.ts` adds
  `deleteExpiredQrTokens(database, now?)` (deletes `old_qr_tokens` rows with
  `expires_at <= now` and returns the count) and `startQrTokenCleanup(connectionString)`,
  which starts pg-boss, creates the queue `qr-token-cleanup`, registers the worker
  (one short-lived pool per job) and schedules it daily at `0 3 * * *`. The job is
  started only from the direct API start and stopped by an `onClose` hook, so
  `buildServer` and the test suite never create the pg-boss schema. The demo seed now
  generates a `qr_token` for every object it inserts and backfills an existing demo
  object whose token is `NULL`; a non-null token is never overwritten.
- WP-M2-03: printable QR stickers — `apps/web/src/features/objects/sticker-page.tsx`
  adds `StickerPage` at the guarded route `/objects/stickers`: the active objects of
  `GET /api/v1/objects?active=true` as a checklist (all selected by default, client-side
  search over number, name and city), an A6/A4 sheet format select and a print button
  (`window.print()`). Every card is an A6 sheet card (105 × 148 mm) with the QR of
  `<origin>/m/<qr_token>` (`qrcode.react`, SVG), the object name, the object number, the
  report call and the 112 notice of `PLAN.md` §2; an object with a `NULL` token prints
  without a QR. `apps/web/src/styles.css` carries the mm print geometry, the chosen
  format writes one `@page` rule, and header, nav, toolbar and checklist are
  `print:hidden`. No API route and no PDF endpoint were added — the browser print path is
  the primary path of `PLAN.md` §4/§11.
- WP-M2-04 (spec preparation): `specs/06-report-form.md` chapter 7 and
  `specs/02-data-model.md` §4.8–§4.11 are filled from `PLAN.md` §6/§10 and reviewed —
  the report endpoint contract, the ticket tables, the `ST-<year>-NNNN` counter and the
  note that the rate limit per IP and per QR token is the existing WP-M2-07.
- WP-M2-04 (work packages): the legacy `work-packages/m2/04-report-form-api.md` is
  rewritten into the small-model format and split into **WP-M2-04** (tables, counter,
  append-only trigger), **WP-M2-04b** (`04b-public-report-api.md`, public
  `POST /api/v1/public/tickets` with `client_uuid` idempotency) and **WP-M2-04c**
  (`04c-report-photo-upload.md`, photo files).
- WP-M2-04: ticket schema — migration `0004_ticket_tables` adds `tickets` (UUID v7
  `id`, `ticket_no` default `next_ticket_no()` producing `ST-<year>-NNNN` over the
  per-year row of `ticket_no_counters`, object FK `ON DELETE RESTRICT`, system FK
  `ON DELETE SET NULL`, checks over the `NEW`…`CANCELLED` statuses, the
  `low`…`critical` priorities and the `QR`/`INTERNAL`/`API` sources, `fault_template_keys`
  as `text[]`, the timestamps `reported_at`/`received_at`/`deadline_at`, `clock_skewed`,
  `suspected_spam`, the reporter contact fields and the unique `client_uuid`,
  `status_token` and `ticket_no`, plus the `parent_ticket_id` self FK), the append-only
  `ticket_events` (no `updated_at`, `payload` jsonb, trigger
  `ticket_events_is_append_only` raising `ticket_event_append_only` on a direct
  `UPDATE`/`DELETE` while the ticket's own `ON DELETE CASCADE` passes through
  `pg_trigger_depth() > 1`) and `ticket_photos` (unique `file_path` relative to
  `UPLOAD_DIR`, `image/jpeg`/`image/png` check). Drizzle tables `tickets`,
  `ticketEvents`, `ticketPhotos`, `ticketNoCounters` plus their inferred types in
  `apps/api/src/db/schema.ts`. `apps/api/src/db/__tests__/ticketTables.integration.spec.ts`
  proves the counter under five concurrent inserts, the unique `client_uuid`, the checks,
  the append-only rule, the `RESTRICT`/`SET NULL` behaviour and the cascade. No route,
  no service and no shared schema yet — that is WP-M2-04b and WP-M2-04c.
- WP-M2-04b: public report endpoint — `POST /api/v1/public/tickets` (no authentication)
  in `apps/api/src/tickets/report.ts` with the request/response schemas
  `publicReportRequestSchema`, `publicReportContactSchema`,
  `publicReportResponseSchema` and `faultTemplateKeySchema` in
  `packages/shared/src/schemas/ticket.ts`. The QR token travels in the body and must
  resolve to an **active** object — an unknown, inactive or retired token answers
  `404 qr_token_not_found`. `201` for a new report, `200` with the existing ticket for a
  repeat of the same `client_uuid` (`ON CONFLICT DO NOTHING` over the unique index, so an
  offline outbox replay never creates a second ticket). `422 report_text_required`
  without text and template keys, `422 contact_required` without phone and e-mail,
  `422 system_not_found` for a system of another object, `400 invalid_request` with
  `params.fields` outside the schema. `reported_at` is the device time unless it deviates
  from server time by more than ten minutes — then `reported_at = received_at` and
  `clock_skewed = true` — and `deadline_at` is that base plus 72 h. `status_token` is
  generated with the ticket by the existing `generateQrToken()`, `ticket_no` comes from
  the `next_ticket_no()` column default, and one append-only `created` event
  (`actor_kind = 'public'`, payload with locale, source, template keys and text length)
  is written in the same transaction. No photo field (WP-M2-04c) and no per-IP or
  per-token rate limit (WP-M2-07).
- WP-M2-04c: report photo upload — `apps/api/src/tickets/photos.ts` plus the
  `photoDataUrlSchema` and the `photos` array of `publicReportRequestSchema` in
  `packages/shared/src/schemas/ticket.ts`. `POST /api/v1/public/tickets` accepts up to
  **six** base64 data URLs (`data:image/jpeg;base64,…`) in the same JSON body; every photo
  is decoded, capped against `UPLOAD_MAX_BYTES` (default 10 MB) by its **decoded** size and
  verified by magic bytes — `FF D8 FF` for `image/jpeg`,
  `89 50 4E 47 0D 0A 1A 0A` for `image/png` — so the client claim never decides.
  `422 photo_limit_exceeded` for a seventh photo, `422 photo_too_large` for an oversized
  one, `422 photo_type_unsupported` when claim and bytes disagree; a rejected photo
  aborts the request before a single byte is written, so no half-filled gallery survives.
  Files land at `<UPLOAD_DIR>/tickets/<ticketId>/<file_uuid>.<ext>` (UUID v4 name, never an
  object number) and `ticket_photos` stores the path **relative** to `UPLOAD_DIR`, the
  detected MIME type and the decoded byte count; the route raises its `bodyLimit` to
  `6 × UPLOAD_MAX_BYTES × 1.4` and the response carries the real `photoCount`. The photo
  array of an idempotent repeat is ignored (§7.4). Reading a photo stays phase 10 — the
  uploads volume is never served.
- WP-M2-05: public report form UI — `apps/web/src/features/tickets/report-form-page.tsx`
  adds `ReportFormPage` at the unguarded top-level route `/m/:token`, outside the
  `Shell`/`RequireSession` tree. The page validates the token with `qrTokenSchema`,
  resolves current/retired active QR tokens through `GET /v1/public/qr/:token`, renders the
  prefilled object header, system select when the object has systems, localized fault chips
  from `STANDARD_TEXT_KEYS`/`STANDARD_TEXTS`, free text, contact fields, the 112 notice above
  the submit button and a confirmation with `ticketNo`, `deadlineAt`, `clockSkewed` and the
  `/s/<statusToken>` link. Submit posts `POST /v1/public/tickets` with one `clientUuid` per
  opened form, the current token (not a scanned retired token), selected catalog keys,
  locale and empty `photos` for now; client-side rules mirror the API `422`s before the
  round trip and known error codes map to `ticket:report.errors.*`.
- WP-M2-05b: report photo upload UI — `apps/web/src/features/tickets/image-compress.ts`
  adds `compressImage` (shortest edge capped at `MAX_PHOTO_DIMENSION = 1600`, JPEG
  `PHOTO_JPEG_QUALITY = 0.8`, `scaledSize` math and `photo_type_unsupported` for an
  undecodable or 0 px bitmap) and `photo-upload.tsx` adds `PhotoUpload` with previews,
  byte sizes, remove buttons and the client limit `MAX_REPORT_PHOTOS = 6`. The report form
  now holds `photos: string[]` in state, sends the data URLs in the same
  `POST /v1/public/tickets` body and maps `photo_limit_exceeded`, `photo_too_large` and
  `photo_type_unsupported` to `ticket:report.errors.*`; the confirmation shows
  `report.done.photoCount`. The real canvas path is proven by WP-M2-05c.
- WP-M2-06: public ticket status API — `apps/api/src/tickets/status.ts` adds
  `GET /api/v1/public/tickets/:token/status`, guarded by nothing but the unguessable
  `status_token`: an unknown or malformed token is `404 status_token_not_found`, a known one
  answers `200` with `ticketNo`, the current `status`, `reportedAt`, `deadlineAt` and the
  timeline. `packages/shared/src/schemas/ticket.ts` carries
  `PUBLIC_TICKET_EVENT_TYPES`, `publicTicketEventSchema` and
  `publicTicketStatusResponseSchema`, so only `created`, `work_order_set`, `accepted`,
  `acknowledged` and `closed` are read and the response never carries an event `payload`, an
  actor, contact data, the description or an internal comment. The page itself is WP-M2-06b.
- WP-M2-06b: public status page — `apps/web/src/features/tickets/status-page.tsx` adds
  `StatusPage` at the top-level route `/s/:token`, outside the `Shell`/`RequireSession` tree.
  The token is validated with `qrTokenSchema` before the request, `usePublicStatus(token)`
  reads `GET /v1/public/tickets/:token/status`, and the page shows the ticket number, the
  status as a badge whose colour is paired with the localized text label of
  `ticket:status.values.*` (never colour alone), the deadline and the timeline with the
  localized labels `ticket:status.events.*` plus the localized timestamps — in `de` and `en`.
  A malformed token renders `ticket:status.errors.invalidToken` without a request, an unknown
  one renders `ticket:status.errors.not_found`.
- WP-M2-07: report throttle — migration `0005_report_throttle` adds the append-only
  `report_throttle` table (one row per public report attempt: `ip` as `inet`, `qr_token`,
  `created_at`, indexed by `(ip, created_at)` and `(qr_token, created_at)`) and
  `apps/api/src/tickets/spam.ts` adds `recordReportAttempt`, `recentReportCount` (the higher of
  the per-IP and the per-token count inside the window) and `isReportSuspicious` (more than
  `SUSPICION_MAX` = 3 attempts inside `SUSPICION_WINDOW_MS` = 10 minutes) — the window is a
  `count(*)` in PostgreSQL because the stack has no cache and no Redis. No route consults it
  yet: the honeypot, the Altcha proof of work and the `tickets.suspected_spam` write are
  WP-M2-07b/07c/07d. The retention of the stored IP stays an open decision.
- WP-M2-07b: Altcha captcha primitives — `apps/api/src/tickets/altcha.ts` adds
  `createAltchaChallenge` (SHA-256 proof of work, difficulty `ALTCHA_MAX_NUMBER`, the
  expiry carried inside the `salt` so one solved payload cannot be replayed forever),
  `verifyAltchaPayload` (recomputes `hash(salt + number)`, the HMAC signature over that
  hash and the expiry) and the unauthenticated
  `POST /api/v1/public/altcha/challenge`; `apps/api/src/index.ts` registers it next to the
  other public routes. `ALTCHA_SECRET` empty means "no captcha configured" and answers
  `404 altcha_not_configured`. `altcha-lib` is held on its v1 major: its challenge format
  `{ algorithm, challenge, salt, signature, maxnumber }` is the one the `altcha` web
  component answers with. Nothing on the create path reads it yet — that is WP-M2-07c.
- WP-M2-07c: spam decision on the report create path — the public report request accepts
  the optional honeypot field `website` and an optional Altcha `verification` payload, and
  `apps/api/src/tickets/report.ts` records every new public report attempt in the
  `report_throttle` table before writing the ticket. A filled honeypot is stored with
  `tickets.suspected_spam = true`; a suspicious report (more than three attempts per IP
  or QR token inside 10 minutes) asks for the proof of work with `400 captcha_required`,
  stores it as suspected spam when no captcha is configured and otherwise accepts only a
  verified `altcha-lib` payload. An idempotent repeat returns the existing ticket before
  the spam decision, so replay does not create or flag a second ticket.
- WP-M2-07d: honeypot and Altcha widget in the public report form — the form at `/m/:token`
  now sends the hidden `website` honeypot with every report (invisible for a human: no
  label, no tab stop), and only a `400 captcha_required` makes the Altcha widget appear:
  the challenge is fetched from `POST /api/v1/public/altcha/challenge`, the solved proof
  of work travels back in the `verification` field of the next attempt, and the widget
  itself is loaded on demand — a reporter of a normal report never sees a captcha.
  The `altcha` web component is held on its v3 major, which answers the v1 challenge
  format of `altcha-lib`.

### Changed

- Governance split: `AGENTS.md` now regulates only the agent behaviour and the
  workflow — plan anchor, before-you-start checklist, work-package discipline, the
  follow-up closure rule, the quality-gate and CI-after-push behaviour, commits,
  version tags, the mandatory todo list, structure discipline and the security rules.
  Every project-specific fact moved into `PLAN.md`: the i18n mechanics (§3.1), the
  coding conventions beyond the stack table (§4.1), the data model lessons (§6.1), the
  six `check` gates with the WP-M1-01 deviation (§18.1), the development commands for
  database, migrations, seeds and E2E (§18.2) and the CI run-name, publish-dispatch,
  version-tag and credential-store mechanics (§18.3); `PLAN.md` §16 names
  `docs/REPO-MAP.md` as the only inventory of the code. The section references of the
  removed `AGENTS.md` chapters were repointed to `PLAN.md` in
  `specs/02-data-model.md`, ADR-0002, `docs/REPO-MAP.md`, `apps/web/src/lib/api.ts`,
  `.github/workflows/check.yml` and `scripts/e2e-check.mjs`.
- WP-M1-12: `apps/web/src/i18n/index.ts` reads the stored language preference
  (`i18nextLng`, only `de`/`en`) as the initial language, with `de` still the default and
  the reference locale and a broken storage never breaking init. Without it the `en` bundle
  was unreachable in a running app, so no English test could exist; a later language
  switcher UI writes exactly this key. `npm run check` gained the sixth gate `test:e2e`, and
  the `check` job step is named `Quality gates (typecheck, lint, tests, i18n, wp, e2e)`.
- WP-M1-10f (completed): `build.yml` closes the CI naming rule — `permissions:
actions: write`, the job `Resolve version tag` gained the guarded step
  `Name the run after the version` (`gh api --method PATCH` renames the run to
  `publish <version>`, `continue-on-error: true`), the publish jobs are named
  `Publish <service> image <version>`, the step `Build and push image` and the new
  `Write image summary` step write image names, tags, version, source SHA and
  source run URL into the job summary. `AGENTS.md` states the run-naming rule and
  `CONTRIBUTING.md` speaks of `publish images`.
- WP-M1-10f (partial): CI runs are self-describing now. `check.yml` gained
  `run-name: check · <ref> · <event>` and the step names `Quality gates
(typecheck, lint, tests, i18n, wp)` and `Build web and API artifacts (no publish)`.
  `.github/workflows/build.yml` is displayed as **publish images** instead of
  `build and push` and gained `run-name: publish images · <event> · <source branch>`.
  The first attempt used `${{ substring(github.sha, 0, 7) }}` in both labels — GitHub
  Actions has no `substring()` function, so the push produced four runs named after the
  workflow file that failed instantly with zero jobs; the labels carry no short SHA now.
  GHCR image names and the tag set are unchanged; the run rename to `publish <version>`,
  the publish job/step names and the image run summary are still open
  (see `work-packages/m1/10f-ci-run-naming.md`).
- CI housekeeping (no work package): the `playwright` job of `check.yml` was removed —
  the repository has no `playwright.config` and no E2E spec, so the job only re-ran the
  web unit tests with an installed Chromium. It comes back with WP-M1-12. All publish
  runs now share one serialising concurrency group (`publish-queue`), so a slower build
  of an older commit can no longer overwrite `latest`.
- WP-M1-10g (superseded by WP-M1-10h): attempted to version the run names by letting
  `check.yml` rename its own run through `gh api --method PATCH
actions/runs/<run_id>`. It never took effect: the run stayed `check · main · push` and
  the publish run inherited that plain title as `publish check · main · push · main`
  (runs 41034256724 and 41034380131). Two wrong assumptions — see WP-M1-10h.
- WP-M1-10h: the quality gates hang on the version tag. **A workflow run cannot be renamed
  at all**: the REST reference of the workflow-runs API lists rerun, cancel, delete, logs,
  approvals and timing only, and the PATCH call of WP-M1-10g answers `404` (hidden by
  `continue-on-error: true` since WP-M1-10f). A label therefore has to be right when the run
  starts, and the only payload carrying the version is a tag push — which `git push
--follow-tags` produces for every commit. `check.yml` triggers on
  `push: tags: ['v[0-9]*']` (plus `pull_request` and `workflow_dispatch`) instead of
  `push: branches: [main]`, its `run-name` is `github.ref_name` so the run is titled
  `v0.0.NN`, and the dead `Resolve version tag` rename job plus `actions: write` are gone.
  `build.yml` drops the `branches: [main]` filter of its `workflow_run` trigger, gates the
  version job on `workflow_run.event == 'push'` so pull request runs never publish, and its
  `run-name` is `publish <title of the calling check run>` → `publish v0.0.NN`. Consequence:
  a commit pushed without its tag gets no quality-gate run, so the one-tag-per-commit rule
  is now a build precondition in `AGENTS.md`.
- WP-M1-10i: the publish run label says what is new. A `workflow_run` payload only carries
  the title of the calling run, so `publish v0.0.NN` was the ceiling, and no Actions
  expression can turn `head_commit.message` of a tag push into one line (that field is the
  whole multiline commit message — verified through the Actions API: the runs of `v0.0.49`
  and `v0.0.50` carry the commit SHAs `b13e9d4`/`ca4c948` as `head_sha`, while the annotated
  tag objects are different SHAs). The green `check` run of a tag now ends with the job
  `Dispatch publish run`, which posts a `workflow_dispatch` event for `build.yml` with the
  inputs `version`, `notes` (the commit subject), `source_run` and `mode=check` — the only
  payload that carries usable free text. `build.yml` triggers on `workflow_dispatch` alone,
  titles itself `publish <version> · <notes>` (manual runs:
  `publish <version> · manual · <ref>`), checks that the tag at HEAD equals the requested
  `version`, and moves `latest` only for `mode=check`. Side effect: the empty `publish
images` runs of finished pull request runs are gone, and the check↔publish link now lives
  in the `source_run` input and both job summaries. Lesson from the first push: a job
  without `runs-on` fails the Actions schema and with it the whole file — the run then has
  zero jobs, is titled with the workflow path and ignores its trigger filters, so one
  `git push --follow-tags` produced two failed `check` runs. `js-yaml` only validates YAML
  syntax, so the fix push was preceded by a `js-yaml` pass over both workflows that asserts
  `runs-on`, a non-empty `steps` list and resolvable `needs` for every job.
- WP-M1-11: `docs/REPO-MAP.md` is English and current through phase 1, which closes the
  deviation note that WP-M1-10, WP-M1-10c and WP-M1-10d carried. The tree now shows the
  folders phase 1 actually created (`apps/web/src/{admin,auth,lib,routes}`,
  `apps/api/src/{admin,auth,config,notifications}`) and marks the folders that are still
  empty on purpose (`components/`, `features/*`, `tickets|objects|oncall|stats|jobs`). The
  module table gained the rows that were missing: `apps/api/src/index.ts` (`buildServer` with
  the `{ code, params }` error envelope and `/api/v1/health`),
  `packages/shared/src/schemas/user.ts`, `packages/shared/src/i18n/t.ts`,
  `apps/web/src/routes/index.tsx`, `apps/web/src/App.tsx` and `main.tsx`,
  `apps/api/drizzle.config.ts`, `apps/api/scripts/copy-migrations.mjs`, the Husky hooks with
  the one-tag-per-commit rule, the three Compose overrides, the ADR files and the governance
  documents. The map is 168 lines (limit 200) and the legacy WP document
  `work-packages/m1/11-repo-map.md` was rewritten into the small-model format.
- WP-M1-10d: `docs/DECISIONS.md` and the ADRs are English, as the language rule of
  `AGENTS.md` requires. The index titles the records "Monorepo with npm workspaces" and
  "UUID v7 as the database primary key", the template block asks for `Status`, `Date` and
  `Stakeholders` above `Context`, `Decision`, `Alternatives` and `Consequences`, and
  ADR-0002 keeps every technical statement: Postgres 16 has no `uuidv7()` (that arrives
  with Postgres 18), migration `0000_base_tables` provides `gen_uuid_v7()` (48-bit
  millisecond timestamp, version 7, RFC 9562 variant bits, random remainder) written as
  `CREATE OR REPLACE` and declared `VOLATILE`, the four rejected alternatives, and the
  caveat that the ticket timeline follows event timestamps and event sequences rather than
  IDs. The English slugs and the ADR-0001 translation had already landed in the
  work-in-progress commit `b573fb5`, so the German remainder was the index, the template
  and ADR-0002. `docs/REPO-MAP.md` shrinks its deviation note to the map itself, which
  WP-M1-11 normalizes.
- WP-M1-10c: the four `docs/` placeholders `ARCHITECTURE.md`, `COMPLIANCE.md`,
  `GLOSSARY.md` and `I18N.md` are English now, as the language rule of `AGENTS.md`
  requires. `ARCHITECTURE.md` separates what is live (`/api/v1/health`, the auth
  routes, the admin users routes) from what is still planned (public report route,
  ticket state machine, notification outbox, pg-boss jobs, Dexie working copy), the
  permission source of truth is corrected to `packages/shared/src/permissions.ts`,
  and the locale table states `de` as default and reference while `en` must be
  complete.
- WP-M1-10: `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` are English
  now, and `CODE_OF_CONDUCT.md` carries the full Contributor Covenant 2.1 text
  instead of a paraphrase; the last German step name in
  `.github/workflows/check.yml` is English too. `SECURITY.md` no longer points at a
  `SECURITY_CONTACT` variable that `.env.example` does not define — the reporting
  channel is the operator of the instance or a private GitHub report.
- WP-M1-08: `POST /api/v1/auth/login` answers the same user object as
  `GET /api/v1/me` — the shared `meResponseSchema` now requires `permissions`, so
  the UI needs no second round trip to know what to show.
- Language rule tightened: code, comments, test names, commit messages and
  developer documentation are English; the app stays multilingual (`de` default,
  `en` complete) and UI text uses i18n keys only.
- README and `AGENTS.md` switched to English.
- Default image build context is now the local checkout (`.`). Deployment panels
  that clone the repository themselves set `IMAGE_BUILD_CONTEXT` to the Git URL.
- The web container no longer waits for a healthy API, so the UI is reachable
  even while the API is starting or failing.
- The emergency notice uses 112 only; no other emergency number is part of the
  product text.
- The production stack publishes only the web port (`WEB_PORT`): `api` and `db`
  stay on the internal `backend` network, so they cannot collide with ports of
  other projects on the same Docker host. `API_PUBLISHED_PORT` and
  `API_BIND_ADDRESS` apply to the debug override only.

### Fixed

- WP-M1-14: the base seed broke the contract of `work-packages/m1/06-seeds-base.md` §4 in
  commit 82a9fc7 — a re-run overwrote the `password_hash` of an existing administrator,
  although the seed must never reset a changed password, and the status was derived from
  `inserted.length === 1`, which PostgreSQL `RETURNING` also reports for an upsert, so the
  second run claimed `created` instead of `existing`. The failing assertion in
  `seed-base.integration.spec.ts` encoded the specified behaviour. This fixes the red
  `check` runs v0.0.58 … v0.0.61.
- WP-M0-05: the Docker smoke test no longer treats the internal `expose: 3000`
  of the API as a published host port; `docker compose port` reports it as
  `:0`, so only a real non-zero public port fails the guard.
- WP-M0-05: version tags are now annotated, so `git push --follow-tags`
  actually publishes them and the `build and push` workflow can resolve the
  version of the pushed commit.
- WP-M1-10b: the three GitHub issue forms in `.github/ISSUE_TEMPLATE/` render as
  forms again — they had no closing front-matter delimiter and no nested
  indentation for `attributes` and `validations`, so GitHub showed them as plain
  text. The emergency notice in `bug.md` and `feature.md` names 112 only (no 110),
  and `.prettierignore` keeps Prettier from rewriting the form YAML.

### Deviations

- WP-M1-01: `npm run check` uses per-workspace typechecks instead of a single
  `tsc --noEmit` across all packages (see `AGENTS.md`); ESLint uses a flat config
  (`eslint.config.js`) instead of `.eslintrc.cjs`.
- WP-M1-03: the first migration uses drizzle-kit's number `0000` instead of
  `0001`; exactly one migration exists.
- WP-M0-04: the acceptance command `sh scripts/docker-smoke.sh` was not executed
  locally because the development container has no Docker; verified with `sh -n`
  and `npm run check`, the CI job `docker-smoke` runs the real smoke test.
- WP-M1-10b: while adding the `.github/ISSUE_TEMPLATE/` entry, the German
  drizzle-kit comment in `.prettierignore` was translated — `AGENTS.md` requires
  English everywhere.
- WP-M1-10c: the glossary names each term in English and keeps the German UI label in
  parentheses (`Objekt`, `Anlage`, `Rolle`), so the vocabulary of the German product
  text stays findable from English developer documentation.
- WP-M1-12: the bundled Playwright Chromium is a glibc build and cannot start in this
  Alpine (musl) development container, so the two tests ran locally against the
  distribution browser — `E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`
  printed `2 passed` after `prepared throwaway database …` and `dropped throwaway
database …`. Without that variable the runner prints its skip notice and `npm run check`
  stays green, which is why the CI job installs the browser and reports the real run.
- WP-M1-12: the legacy WP document `work-packages/m1/12-smoke-e2e.md` was rewritten into
  the small-model format, and its four-line task list gained the ten-line stored-language
  read in `apps/web/src/i18n/index.ts`: the acceptance demands an EN test, and the app had
  no path to the `en` bundle.

### Fixed

- The ticket detail dropdown of WP-M4-07 now performs body-less workflow actions
  (review, assign, accept, close) on confirmation and navigates back to the ticket
  list via "`Zurück zur Liste`": the redesign left them without any working target,
  so the phase-4 and phase-5 E2E exit criteria (WP-M4-01, WP-M5-08) were red in CI
  for runs v1.0.25 … v1.0.29 against a real database and Chromium. The E2E specs
  now drive the dropdown menu instead of the removed buttons
  (`select[name="ticketAction"]`, payload inputs addressable via their `name`
  attributes). `npm run check` is green end to end.

### Not implemented (by design)

- All domain logic (tickets, objects, on-call, notifications, UI).
  Implementation happens only as a work package from `work-packages/` — so far
  WP-M1-01 to WP-M1-12 (foundation, base data model, RBAC, seeds, session core,
  the auth HTTP layer, the permission guard, the admin users and roles APIs with their
  UI, the CI chain and the Playwright smoke test) are
  implemented.
