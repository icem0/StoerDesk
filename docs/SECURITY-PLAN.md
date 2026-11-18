# Security-Audit — Procedure & Coverage

Erste Durchgang: 2026-11-06, HEAD `1ff37b1fefca1a1549ee3a090517d6ab66a4eaf7`.

Repeat pass: 2026-11-09, diff `1ff37b1f..6351037` (181 files) — areas A and B in full,
areas C–K for the changed files. The findings of that pass live in
`.security/findings.md` (gitignored).

Closure pass: 2026-11-09, diff `6351037..249c8a0` (13 commits, WP-M9-26 … WP-M9-38) —
areas A and B re-checked in full (91 routes, no new route in the diff), C–K re-checked
only for the files the diff touched. Every finding SEC-004 … SEC-020 of the repeat pass
now resolves against a shipped fix; `.security/findings.md` carries the FIXED status.

Ticket-number-counter pass: 2026-11-18, diff `efb7e2b1..` (WP-M14-129a, the
database layer of the year-free ticket number) — areas A and B re-checked in
full (the route table is unchanged, the diff adds a migration, the Drizzle
mirror and the ticket-tables integration spec), C re-checked for
`apps/api/src/db/migrations/0048_ticket_no_counter_global.sql`,
`apps/api/src/db/schema.ts` and
`apps/api/src/db/__tests__/ticketTables.integration.spec.ts`: the migration is
literal SQL without a request value, `next_ticket_no()` allocates over the
constant key `global` and returns `ST-` plus the counter, the Drizzle mirror
binds no new value and the spec writes the mock number `ST-1999-0001` and the
allocated ones only; H re-run (`npm audit --omit=dev` reports 4 advisories in
`@fastify/static` and its transitive `glob`/`minimatch`, no dependency changed in
this diff — the finding is open in `.security/findings.md`); K re-checked: no
log line added, no contact value, no IP. No new finding of the diff itself.

CSV-import pass: 2026-11-10, diff `6a94e62..` (WP-M10-12, 5 files) — areas A and B
re-checked in full (still 91 routes, the package adds a service and shared contracts
only, no route), C–K re-checked for `apps/api/src/objects/import.ts`,
`packages/shared/src/schemas/object-import.ts` and `packages/shared/src/schemas/index.ts`:
the byte and row limits are enforced before parsing, the object-number lookup reads
only the object numbers of the file through `lower(object_no)` with drizzle-bound
values, every row passes through the existing create-object contract and the commit
runs in one transaction with per-row `{ code, params }` errors. No new finding.

CSV-route pass: 2026-11-10, diff `b087bd2..6087bd4` (WP-M10-13, 3 Dateien + die
Versionfile) — areas A and B re-checked in full (93 routes: the package adds
`POST /api/v1/objects/import` and `POST /api/v1/objects/import/preview`, both with
the `object.import` preHandler, no public capability and no bearer scope; die
guard answer `401 session_invalid` before `403 forbidden`), C–K re-checked for
`apps/api/src/objects/import-routes.ts` and `apps/api/src/index.ts`: the request
body passes through `objectImportRequestSchema` before anything is read (die
`csv` string is length-bound, an unknown mapping target is rejected with the
field path `mapping.<header>`), no value is interpolated into SQL there (the
service of WP-M10-12 binds its values through drizzle) and neither answer noch
log carries contact data or a token. No new finding.

Retention pass: 2026-11-10, diff `7349e01..` (WP-M10-15, two new modules, the
server registration and the version file) — areas A and B re-checked in full (still
93 routes: the package adds no route and no capability, the retention run is a
scheduled process started only from the direct API start, so no client input reaches
it), C–K re-checked for `apps/api/src/jobs/privacy-retention.ts`,
`apps/api/src/settings/privacy.ts` and `apps/api/src/index.ts`: every window
comparison, update and delete binds its values through drizzle (no SQL
interpolation, the batch ids come from the same select that carries the where clause),
the photo path is resolved against `UPLOAD_DIR` and a path that escapes the volume is
never touched, a missing file never fails the run and never reveals its name, stored
retention values are accepted only as whole months of one or more (a malformed row
falls back to the 24-month default), and both the job log and the settings module
carry aggregate counters, machine keys and setting keys only — no ticket number, no
name, no phone number, no e-mail and no IP. No new finding.

Privacy-routes pass: 2026-11-10, diff `28852ee..` (WP-M10-16, two new modules, the
server registration and the version file) — areas A and B re-checked in full (95 routes:
the package adds `GET /api/v1/privacy/tickets/:ticketNo/export` and
`POST /api/v1/privacy/tickets/:ticketNo/erase`, both with the `user.write`
preHandler, no public capability and no bearer scope, so the guard answers
`401 session_invalid` before `403 forbidden`) — the route table gained those two rows;
C–K re-checked for `apps/api/src/privacy/routes.ts`,
`packages/shared/src/schemas/privacy.ts` and `apps/api/src/index.ts`: the
`ticketNo` path parameter is format-validated by `ticketNoSchema` before it is used
(SEC-015 class), the request body passes through `personalDataEraseRequestSchema` with
a trimmed 5–1000-character bound before anything is written, every lookup and update
binds its values through drizzle, the export answers no `status_token` and no event
payload (the erasure payload carries the reason length only, never the reason text), the
erased event is inserted (never updated or deleted) so the append-only trigger keeps it,
the idempotency probe reads the same event type in the same transaction and neither the
answer nor a log line carries a contact value. No new finding.

Findings never live in the repository. They go into **`.security/findings.md`**
(gitignored via `.gitignore` line `.security/`). Tracked files, commit messages and
work-package titles never carry the location or description of an open gap.

## Run procedure
Comment pass: 2026-11-10, diff `979f19e..` (WP-M5-17, WP-M5-18, the two web modules
and the two locale files) — areas A and B re-checked in full (still 95 routes: the
packages add no route, no capability and no bearer scope, so the guard answers are
unchanged), C re-checked for the two changed web modules (the comment text is rendered
as text by React and never assembled as HTML, the dialog only displays what the field
holds) and D re-checked for `apps/web/src/sw.ts`, `apps/web/src/lib/sw-routes.ts` and
`apps/web/src/features/tickets/ticket-detail-page.tsx`: the write route matches only
`<api-base>/v1/tickets/<no>/<action>` (the public report and comment routes stay
outside), the invalidation deletes the cached copy of the written ticket from the
`internal-tickets` cache and touches no other cache, and the sign-out clear of that
cache stays the only place that empties it. No new finding.

Comment pass: 2026-11-12, diff `d9f7628..` (WP-M12-02, `apps/api/src/tickets/workflow.ts`
and the new `workflow-columns.integration.spec.ts`) — areas A and B re-checked in full
(the WP adds no route, no capability and no bearer scope, so the guard answers are
unchanged), C re-checked for `workflow.ts`: the added `work_order_type`/`work_order_number`
columns take the strings of the request payload only after the route's zod schema
(`type` ≤ 40, `number` ≤ 60 characters) and a `typeof` guard, and drizzle binds every
value — no SQL interpolation, no LIKE, no HTML assembly; the timestamps are derived on
the server, never read from the body. K re-checked for the new test: it writes one
throwaway user with a `randomUUID()` e-mail and no contact data, and the runner's log
lines stay code-level. No new finding.

Channel-config pass: 2026-11-12, diff `2fbdf80..` (WP-M14-04 — the schema, migration
`0033_notification_channel_config.sql`, the new config service and its unit test) —
areas A and B re-checked in full (no new route, no new capability, no bearer scope:
the package only adds table columns and a service), C–K re-checked for
`apps/api/src/db/schema.ts` and `apps/api/src/notifications/config.ts`: the service
runs one schema-bound select without any client input or value interpolation, the
write-only secret of a row only decides `secretSet` and never enters the answer, a
log or an event payload (ADR-0005 rule), and the unit test carries mock values
without contact data. No new finding.

Send-view pass: 2026-11-13, diff `a4e0d4f..` (WP-M14-22 — web UI only: the new
`ticket-send-page.tsx`, the detail header icon, the client route table, the
locales and the header test) — areas A and B re-checked in full (no new API
route, no new capability, no bearer scope: the client route `/tickets/:ticketNo/send`
stays behind `RequireSession` in the `App` shell), C–K re-checked for the touched
files: the `mailto:` subject and body only interpolate ticket fields the user
already sees and pass through `encodeURIComponent`, the deep link carries the
ticket number not a token, no SQL, no upload path and no log line is touched
and the locales hold no contact data. No new finding.

HTML-copy pass: 2026-11-13, diff `5b5c43f..` (WP-M14-34 — web UI only: the
copy button of the prepared send view, the clipboard helper and the locales)
— areas A and B re-checked in full (no new API route, no new capability: the
client route `/tickets/:ticketNo/send` is unchanged), C–K re-checked for the
touched files: the clipboard write copies only the rendered ticket block the
user already sees (selection copy first, `ClipboardItem` fallback), no
secret, token or cookie enters the clipboard, no new sink for foreign input
and no log line is touched; the removed `mailto:` body and its `email.*`
locales are gone. No new finding.

Telegram-linking pass: 2026-11-13, diff `7430de2..` (WP-M14-09 — the new linking
module, two session routes in `apps/api/src/notifications/routes.ts`, the shared
contracts and the unit test) — areas A and B re-checked in full (the package adds
`POST /api/v1/notifications/accounts/telegram/code` and
`POST /api/v1/notifications/accounts/telegram`, both guarded by the session only
— `401 session_invalid` without one, no permission key and no bearer scope; the
one-time code is bound to the session user and a foreign user is refused), C–K
re-checked for `apps/api/src/notifications/telegram-linking.ts`,
`apps/api/src/notifications/routes.ts` and `packages/shared/src/schemas/notification.ts`:
the redeem body passes through `redeemTelegramLinkCodeRequestSchema` (trimmed,
1–64 characters) before anything is read, the six-character code comes from
`node:crypto`'s `randomInt` over an unambiguous alphabet, the settings row
`notifications.telegram.code` is write-only and never answered, the Bot API URL
carries the token only in the request itself — a non-ok answer, an unreachable
bot and an invalid JSON answer become typed errors with the status or fixed
English text only, so the token never enters an answer, a log or an error
message (§11.13) — every settings and account write binds its values through
drizzle (the service of WP-M14-08), and the unit test carries a mock bot token
and mock users without contact data. No new finding.

Matrix-linking pass: 2026-11-13, diff `c65039c..` (WP-M14-11 — the new linking
module, the Matrix `POST` and the account `DELETE` in
`apps/api/src/notifications/routes.ts`, the shared contract and the unit test) —
areas A and B re-checked in full (the package adds `POST
/api/v1/notifications/accounts/matrix` and `DELETE
/api/v1/notifications/accounts/:channel`, both session-guarded only — `401
session_invalid` without one, no permission key and no bearer scope; the `DELETE`
predicate carries the session user id, so the account of another user can never
be removed), C–K re-checked for `apps/api/src/notifications/matrix-linking.ts`,
`apps/api/src/notifications/routes.ts` and
`packages/shared/src/schemas/notification.ts`: the body passes through
`matrixLinkingRequestSchema` (trimmed, length-bound) before anything is read, the
homeserver must be an https URL before the request and the access token travels
only in the `authorization` header of that one `whoami` request, a non-ok answer,
an unreachable homeserver and an invalid JSON answer become typed
`MatrixLinkingError`s carrying a status code or fixed English text only — the
token never enters an answer, a log or an error message (§11.13) — the verified
pair is stored via the drizzle-bound `storeAccount` of WP-M14-08 with the token
as the write-only secret and the answer reports `secretSet` only, and the unit
test carries mock tokens and mock users without contact data. No new finding.

WhatsApp-linking pass: 2026-11-13, diff `965c0e8..` (WP-M14-15 — the new linking
module, the WhatsApp `GET .../status` and `POST` in `apps/api/src/notifications/routes.ts`,
the own-channels section and the unit test) — areas A and B re-checked in full (the package
adds `GET /api/v1/notifications/accounts/whatsapp/status` and `POST
/api/v1/notifications/accounts/whatsapp`, both session-guarded only — `401
session_invalid` without one, no permission key and no bearer scope; the removal stays the
existing `DELETE /api/v1/notifications/accounts/:channel` whose predicate carries the session
user id, so the account of another user can never be removed), C–K re-checked for
`apps/api/src/notifications/whatsapp-linking.ts`, `apps/api/src/notifications/routes.ts` and
`apps/web/src/settings/notifications-page.tsx`: the bridge config is read from the row
`whatsapp` of `notification_channels` (public `config.baseUrl`, write-only `secret`) with the
`WHATSAPP_BRIDGE_URL` / `WHATSAPP_BRIDGE_TOKEN` environment fallback, the bearer travels only
in the `authorization` header of that one `GET /status` request, an unreachable bridge, a
non-ok answer and an invalid JSON answer all resolve to `{ connected: false, chats: [] }`
— never an error — the submitted `chatId` passes through a trimmed, length-bound zod schema
before anything is read and is stored only when the bridge names it (a chat the bridge does
not know is a `422 invalid_request`, nothing is written), the account is stored via the
drizzle-bound `storeAccount` of WP-M14-08 with `externalId` the chat id and no secret, no
value is interpolated into SQL, and neither the answer, a log nor the error text carries the
bearer (§11.13) — the PWA section renders bridge chats and the account with no contact data.
No new finding.

Preferences-routes pass: 2026-11-13, diff `5abab01..` (WP-M14-16 — the new preference
service, the two session routes in `apps/api/src/notifications/routes.ts`, the shared
contracts and the unit test) — areas A and B re-checked in full (the package adds
`GET /api/v1/notifications/preferences` and `PUT /api/v1/notifications/preferences`,
both session-guarded only — `401 session_invalid` without one, no permission key and
no bearer scope; the user id is taken from the session, never from the request, and is
part of both the read and the delete predicate, so the selection of another user can
never be read or replaced), C–K re-checked for `apps/api/src/notifications/preferences.ts`,
`apps/api/src/notifications/routes.ts` and `packages/shared/src/schemas/notification.ts`:
the `PUT` body passes through `updateNotificationPreferencesRequestSchema` (the seven
event types and the seven channel kinds as enums, max. 100 rows) before anything is
written, an unknown event type or channel is a `422 invalid_request` that writes nothing,
the delete and the insert bind their values through drizzle in one transaction (no SQL
interpolation), a repeated `(event_type, channel)` pair is written once, the selection
carries machine keys only — no secret, no name, no contact value — and the unit test
carries mock users and mock channels. No new finding.

ntfy-deep-link pass: 2026-11-13, diff `9718d1d..` (WP-M14-33 — the deep-link
derivation in `apps/api/src/notifications/routes.ts`, the web card
`apps/web/src/features/settings/NtfySubscription.tsx` and the two touched unit
tests) — areas A and B re-checked in full (no new route, no new capability, no
bearer scope: the existing `GET /api/v1/notifications/accounts/ntfy` stays
session-guarded only and takes the user id from the session, so the topic and
the host of another user can never be answered), C–K re-checked for the touched
files: the deep link `ntfy://<host>/<topic>` is derived from the configured
public server address with its scheme stripped — no credential, no token and no
account secret enters the answer, the QR payload or a log (§11.13, ADR-0005),
the route keeps an empty `GET` without parameters, no SQL, no path join and no
upload is touched and the tests carry mock hosts and mock users without contact
data. No new finding.

ntfy-recipients pass: 2026-11-14, diff `0ad3d06..` (WP-M14-45 — the new
`apps/api/src/notifications/receivers.ts`, the enqueue and the drain in
`apps/api/src/notifications/outbox.ts`, the `ticket.created` argument in
`apps/api/src/tickets/report.ts` and the two outbox specs) — areas A and B
re-checked in full (no new route, no new capability and no bearer scope: the
package changes only the send path of the existing report transaction and adds
no HTTP surface), C re-checked for the new query: the preference and account
values are bound through drizzle (no SQL interpolation; the event type is a
server-side constant), the recipient answer carries only the derived or stored
ntfy topic and never a secret, D and G are untouched (no path join, no upload),
and K re-checked for the touched files: the drain log still names aggregate
counters, the channel and the ticket number — never contact data or a token —
and `target.ntfyTopic` is the opaque topic of §11.3, not a contact value. The
integration probe uses mock topics only. No new finding.

ntfy-access-token pass: 2026-11-14, diff `eb3f6d7..` (WP-M14-51 — `apps/api/src/notifications/config.ts`, `verification.ts`, `routes.ts`, `outbox.ts` and their four unit specs) — areas A and B
re-checked in full (the package adds no route, no capability and no bearer scope: it
changes only how the existing admin test send, the verification code and the outbox
drain resolve their ntfy target), C re-checked for the touched files: no new select,
insert or interpolation — the access token is read from the already schema-bound `secret`
column and the `NTFY_TOKEN` env value and travels only as a config field, D and G
untouched, F re-checked: `NTFY_TOKEN` is an empty placeholder in `.env.example` and `.env`
stays gitignored, and the token is not in `channelConfigurationSchema`, so both
`channelConfigurationSchema.parse` and `channelConfigurationListResponseSchema.parse`
strip it from every answer (asserted by the new list test), H, I and J untouched, and
K re-checked for the touched files: the adapter log still names url, method, topic,
priority and the message text — never the header — and the error texts carry the
status code only, so the key appears in no log line, answer, event payload or error
message; the unit tests use the mock values `tk_row` and `tk_env`. No new finding.

ntfy-token-text pass: 2026-11-14, diff `2763026..` (WP-M14-52 — web only:
`apps/web/src/admin/channels-page.tsx`, the de/en `settings.json` and the page
test) — areas A and B re-checked in full (the package changes no route, no
capability and no guard), D re-checked for the page: the curl textarea and the
clipboard copy only assemble the public address, the topic and the literal
`$NTFY_TOKEN` — the stored key is never read by the page, so no secret enters the
DOM, the clipboard or the page state; the new hint is static text and renders the
`secretSet` boolean only, F re-checked: the new locale keys hold no key value, and
K re-checked: no log line is touched. No new finding.

ntfy-timeout pass: 2026-11-14, diff `c65ce2d..` (WP-M14-53 — `apps/api/src/notifications/channels/ntfy.ts`, its test and the de/en `settings.json`) — areas A and B
re-checked in full (no route, no capability and no bearer scope change), E re-checked
for the adapter: the publish request now carries `AbortSignal.timeout` (`NTFY_TIMEOUT_MS`,
overwritten by `NtfyConfig.timeoutMs`), so a server that accepts the connection but
never answers can no longer hold the drain worker or the admin test send open; an
aborted request ends as the machine code `http_timeout` and its message names the
deadline only, F and K re-checked: the added warn line carries the numeric `timeoutMs`,
the access token still enters no log line, no answer and no error text, and the new
locale keys hold no secret; C untouched (no query, no interpolation). No new finding.

Channel-status pass: 2026-11-14, diff `476adba..` (WP-M14-19 — `apps/api/src/notifications/routes.ts`,
`packages/shared/src/schemas/notification.ts`, `apps/web/src/admin/channels-page.tsx`,
`apps/web/src/settings/settings-page.tsx`, the de/en `settings.json` and `common.json` plus the
three touched tests) — areas A and B re-checked in full (the package adds exactly one route,
`GET /api/v1/notifications/status`, behind the `notification.read` `requirePermission`
preHandler: without a session the guard answers `401 session_invalid` before `403 forbidden`,
no public capability and no bearer scope; the route table gained that one row), C re-checked
for the touched query: the status route reuses `resolveChannelStatus` of WP-M9-05 — one
read-only aggregate `sql` template over the `outbox` table without any client input and
without value interpolation, the user id is never read from the request and the answer
carries channel names, counts and timestamps only, the new shared zod contract
`channelStatusListResponseSchema` binds that answer shape, D and G untouched (no token
storage, no path join), F re-checked: the new locale keys hold no secret and no contact
value, K re-checked: no log line is touched and the unit tests use the mock names `signal`
and `matrix` with mock ISO timestamps. No new finding.

Ticket-deep-link pass: 2026-11-15, diff `fe2d397..` (WP-M14-68 — `apps/api/src/notifications/channels/index.ts`,
`apps/api/src/notifications/outbox.ts` and `apps/api/src/notifications/__tests__/outbox-worker.unit.spec.ts`) —
A and B untouched (no route, no guard, no session or bearer handling changed), C re-checked for the touched
files: `ticketDeepLink` builds `<pwa-url>/tickets/<encodeURIComponent(ticket-no)>` from the `env.PWA_URL`
config value and the `ticketNo` of the stored outbox row — the ticket number is DB-bound, percent-encoded
into the path and never client-supplied, no `sql` template, no interpolation and no path join of an upload
changes, the adapters keep their signatures and add no payload field, D re-checked: the link is assembled
in the API drain, not in the PWA, G untouched (no upload path), F untouched (no new env key), K re-checked:
the link carries the ticket number only — never a `status_token`, never a credential, never contact data —
and enters no log line, the two new drain tests use the mock number `ST-2026-0001`. No new finding.

Readiness-allocation pass: 2026-11-15, diff `eb4744a..` (WP-M14-29 —
`apps/api/src/oncall/service.ts`, `apps/api/src/oncall/swaps.ts` and the new
`allocation-notifications.integration.spec.ts`) — areas A and B re-checked in full
(no route, no capability and no bearer scope added: the package only widens two
existing services and the outbox writes already owned by WP-M14-28, the routes of
`POST /api/v1/oncall/shifts`, the assign patch and the swap request stay the ones
of WP-M8-06/09 with their `oncall.plan`/`oncall.admin`/`oncall.swap` guards),
C re-checked for the two changed files: the new `assignedAnnouncementQueued` guard
and the enqueue calls bind their values through drizzle — the shift id comes from
the row the shift write returned, the event type is a server-side constant and no
request value reaches a `sql` template or an interpolation, the user ids of the
announcement are the session-bound actor and target ids the service already
validated against the pool members, D, E, F, G, H, I and J untouched (no frontend,
no outbound request, no new env key, no upload, no dependency, no compose or
workflow change), K re-checked for the touched files: no log line is added, the
`target` jsonb of a readiness row carries pool name, the two UTC timestamps, the
state and the shift id only — no name, no contact value, no secret — and the new
integration test writes throwaway users with `example.org` addresses and mock
channels only. No new finding.

Confirm-draft pass: 2026-11-15, diff `68cded7..` (WP-M14-30 —
`apps/api/src/oncall/confirm.ts`, `apps/web/src/features/oncall/my-shifts-page.tsx`
and the extended `apps/api/src/oncall/__tests__/confirm.integration.spec.ts`) — areas
A and B re-checked in full (no new route, no new capability and no bearer scope: the
confirm and decline routes stay the existing `POST /api/v1/oncall/shifts/:id/{confirm,decline}`
behind their `oncall.confirm` preHandler with the service-level owner/admin check, so the
route table gains no row), C re-checked for `confirm.ts`: the change widens one in-memory
state set (`CONFIRMABLE_STATES` now holds `DRAFT` and `PLANNED`), it adds no select, insert
or interpolation and the shift update plus the `confirmed` event write stay drizzle-bound in
one transaction, D re-checked for the web page: the `DRAFT` branch only decides whether the
existing confirm button renders — the request, the offline queue and the rendered state
labels are unchanged and carry no value beyond what the user already sees, K re-checked for
the touched test: the new shift fixtures use `example.org` addresses and mock pool names,
the new `clientUuid` is a mock UUID literal and no log line is touched. No new finding.

Status-admin pass: 2026-11-15, diff `aeab3ba..` (the key-format repair of WP-M14-35 and
WP-M14-36 — `apps/api/src/db/migrations/0040_ticket_status_key_format.sql` plus its
journal entry, `apps/api/src/db/schema.ts`, `apps/api/src/tickets/status-service.ts`,
`apps/api/src/tickets/status-routes.ts`, the registration in `apps/api/src/index.ts`,
the shared status contracts in `packages/shared/src/schemas/ticket.ts` and the new
`apps/api/src/tickets/__tests__/status-management.integration.spec.ts`) — areas A and B
re-checked in full (the route table gains four rows: `GET /api/v1/admin/statuses` behind
the `settings.read` preHandler and `POST /api/v1/admin/statuses`, `PATCH` and `DELETE`
`/api/v1/admin/statuses/:key` behind `settings.write`; all four are session-only, no
public capability and no bearer scope, so the guard answers `401 session_invalid` before
`403 forbidden`; a status key never resolves a resource of another user and is no IDOR
key of the public layer), C re-checked for the changed files: both bodies pass through
`ticketStatusCreateRequestSchema` / `ticketStatusUpdateRequestSchema` before anything is
read — the key is bound to `^[A-Z][A-Z0-9_]{0,39}$`, the two names to 1–80 trimmed
characters, the color to a six-digit hex value and the position to 0–999 — the `:key`
path parameter is format-checked again before the delete lookup and otherwise enters
only a drizzle-bound `eq`, the insert, the update, the delete and both usage counters
bind their values through drizzle and their `sql` templates carry column references
only (no request value is interpolated into SQL anywhere), and the key-format CHECK
of migration 0040 is the database backstop of the schema rule, D, E, F, G, H, I and
J untouched (no frontend, no outbound request, no new environment key, no upload, no
dependency, no compose or workflow change), K re-checked for the touched files: no log
line is added, an answer carries the machine key, the two localized names, the color,
the position, the flags, the two timestamps and the number of the tickets that carry
the status — no name of a person, no contact value, no secret — and the new test writes
throwaway users with `example.org` addresses, a mock object number and mock tickets
only. No new finding.

Transition-table pass: 2026-11-15, diff `2b2b7fa..` (WP-M14-38a —
`apps/api/src/db/migrations/0041_ticket_transitions.sql` plus its journal entry,
`apps/api/src/db/schema.ts` and `apps/api/src/db/__tests__/ticketTables.integration.spec.ts`)
— areas A and B re-checked in full (the package adds no route, no capability and no
bearer scope: the route table is unchanged, guards and session handling untouched), C
re-checked for the changed files: the migration is literal SQL only — no request value
enters it — both foreign keys cascade onto the unique `ticket_statuses.key`, the dropped
`tickets_status_check` is the accepted ADR-0025 decision 5 (the rows of `ticket_statuses`
are the status configuration and a ticket keeps its status key as history), the schema
mirror binds every column through drizzle and the updated test asserts the new contract
(an unknown status key is stored, the priority and source CHECKs and the duplicate
`client_uuid` still rejected), D–J untouched (no frontend, no outbound request, no new
environment key, no upload, no dependency, no compose or workflow change), K re-checked
for the touched files: no log line added, no answer changed, the test writes mock object
numbers and the `DONE` machine key only — no name, no contact value, no secret. No new
finding.

Transition-service pass: 2026-11-15, diff `c3afab4..` (WP-M14-38b — the shared
contracts in `packages/shared/src/schemas/ticket.ts`, the new
`apps/api/src/tickets/transition-service.ts` and the new
`apps/api/src/tickets/__tests__/transition-service.integration.spec.ts`) — areas A
and B re-checked in full (the package adds no route, no capability and no bearer
scope: the route table, the guards and the session handling stay the ones of
WP-M14-36 and WP-M14-38a), C re-checked for the changed files: the service runs one
select over `ticket_transitions` bound to the schema columns without any client input,
without a `sql` template and without value interpolation, `resolveTransition` is pure
and compares its arguments in memory only, and the zod contract `ticketTransitionSchema`
binds the row shape — both status keys to the key format of `ticketStatusKeySchema`
(the database backstop is the key-format CHECK of migration `0040`), the event key to
`^[a-z][a-z0-9_]{0,39}$`, `condition` to a nullable record — so no foreign value
reaches a query and no answer exists at all in this layer, D–J untouched (no frontend,
no outbound request, no new environment key, no upload, no dependency, no compose or
workflow change), K re-checked for the touched files: no log line is added and nothing
is answered, the test writes no ticket and carries the machine keys of the seeded
workflow only — no name, no contact value, no secret. No new finding.

Transition-administration pass: 2026-11-15, diff `43cb913..` (WP-M14-39 — `apps/api/src/tickets/transition-service.ts`,
`apps/api/src/tickets/transition-routes.ts`, the registration in `apps/api/src/index.ts` and the new
`apps/api/src/tickets/__tests__/transition-management.integration.spec.ts`) — areas A and B re-checked
in full (the route table gains four rows: `GET /api/v1/admin/transitions` behind the `settings.read`
`requirePermission` preHandler and `POST /api/v1/admin/transitions`, `PATCH` and `DELETE`
`/api/v1/admin/transitions/:id` behind `settings.write`; all four are session-only, no
public capability and no bearer scope, so the guard answers `401 session_invalid` before
`403 forbidden`; the `:id` path parameter is a UUID, not an IDOR key of the public layer and
never resolves a resource of another user), C re-checked for the changed files: the request bodies
of `POST` and `PATCH` pass through the local `transitionCreateRequestSchema` /
`transitionUpdateRequestSchema` before anything is read — both status keys bound to
`ticketStatusKeySchema` (`^[A-Z][A-Z0-9_]{0,39}$`), the event key bound to
`^[a-z][a-z0-9_]{0,39}$`, `condition` to a nullable record — the `:id` path parameter is
format-checked with `z.uuid()` before the select/update/delete and otherwise enters only
a drizzle-bound `eq`, every insert, update, delete, existence probe and duplicate probe
binds its values through drizzle with no `sql` template that interpolates a request value
(the two `sql` uses of the module are column-reference aggregates only), a status key that
names no row of `ticket_statuses` answers `400 invalid_status_key` with the field path
before any write (the FK of migration `0041` is the database backstop) and a duplicate
`(from_status, event_key)` is caught as the SQLSTATE 23505 of the unique index of that
migration → `409 transition_duplicate` with the pair, D, E, F, G, H, I and J untouched (no
frontend, no outbound request, no new environment key, no upload, no dependency, no compose
or workflow change), K re-checked for the touched files: no log line is added, an answer
carries the row identity, the two machine keys, the event key, the stored `condition` record,
the `active` flag and the `updatedAt` timestamp only — no name of a person, no contact value,
no secret — and the new test writes throwaway users with `example.org` addresses, machine
keys and mock UUIDs only. No new finding.

Transition-UI pass: 2026-11-15, diff `587f7ad..` (WP-M14-39b — the new web page
`apps/web/src/admin/transition-page.tsx`, the client route table `apps/web/src/routes/index.tsx`,
the settings menu `apps/web/src/settings/settings-page.tsx`, the de/en `settings.json` and `common.json`
and the page test) — areas A and B re-checked in full (no new API route, no new capability, no
bearer scope: the client route `/admin/transitions` stays behind `RequireSession` inside the `App`
shell, so an unauthenticated visit renders the login form and the server guard of WP-M14-39 stays the
only enforcement point; the route table is unchanged), C re-checked for the touched files: the page
reads the rows through `apiFetch` and sends only the field values the user typed — both status keys
bound to `ticketStatusKeySchema` and the event key to `ticketTransitionEventKeySchema` before the
request is sent — no SQL template, no path join and no upload is touched, D re-checked for the page:
the form renders what the user typed, the confirmation dialog shows the machine keys of the row only
and no secret, token, cookie or account value enters the DOM, the row identity is the `id` of the row
and never resolves a resource of another user, F re-checked: the new locale keys hold machine keys,
static text and the `{{from}}`/`{{event}}`/`{{id}}` interpolations of those machine keys only, K
re-checked: no log line is touched and the page test carries mock machine keys, mock UUIDs and an
`example.com` e-mail only. No new finding.

Ntfy-topic pass: 2026-11-16, diff `4abe93f..` (WP-M14-72 — `apps/api/src/notifications/accounts.ts`,
`apps/api/src/notifications/receivers.ts`, `docker-compose.yml` and the receivers spec plus the
fixture updates in `outbox.unit.spec.ts` and `phase14-exit.integration.spec.ts`) — areas A and B
re-checked in full (no new route, no capability and no bearer scope: the package changes the
stored ntfy topic and the recipient read of the existing outbox path only, the route table and
the guard answers stay the ones of WP-M14-16 and WP-M14-19), C re-checked for the touched files:
`newNtfyTopic()` is `node:crypto` `randomBytes(16)` rendered as hex — a 128-bit value with the
`stoerdesk-` prefix, never derived from a user id; `storeAccount` keeps its drizzle-bound upsert
and only replaces an empty `externalId` in memory before the write, `ntfyRecipients` narrows its
answer to the stored topics (the `stoerdesk-<userId>` fallback removed, no new select, no
interpolation, the event type stays a server-side constant), D, E to H and J untouched (no
frontend, no outbound request change, no new environment key, no upload, no dependency, no CI
change), I re-checked for `docker-compose.yml`: the `backup` service mounts the named volume
`ntfydata` read-only (`:ro`) at `/data/ntfy` and tars it — no host port added, no secret on a
command line and ntfy stores the API token hashed, so the archive carries no plaintext token,
K re-checked for the touched tests: the fixtures carry mock topics (`stoerdesk-stored`,
`shared-topic`), the entropy assertion is a format match only and no log line is touched —
one accepted deviation: the ntfy adapter still logs the topic of a send, and a topic is now the
only access secret of a subscription (the finding and its class are recorded in
`.security/findings.md`, not here).

Ntfy-subscription pass: 2026-11-16, diff `8bab9fd..` (WP-M14-72b —
`apps/api/src/notifications/routes.ts` and `apps/api/src/notifications/__tests__/routes.unit.spec.ts`)
— areas A and B re-checked in full (no new route, no new capability and no bearer
scope: the existing `GET /api/v1/notifications/accounts/ntfy` stays session-guarded
only, the user id is taken from the session and enters the select and the upsert
predicate only as a drizzle-bound `eq`, so the stored topic of another user can
never be read or replaced; the provisioning write is the `storeAccount` of WP-M14-08
with its drizzle-bound upsert over the unique `(user_id, channel)` key), C re-checked
for the touched route: the new select reads only the `externalId` column of
`notificationAccounts` under the session-bound predicate — no request value exists
at all (an empty `GET` carries no body and no parameter), no `sql` template and no
interpolation is added, the provisioned topic is `node:crypto` randomness from
`newNtfyTopic()` and never client-supplied, the stored topic only ever answers
inside the subscription address and the deep link of the owning user, D to J
untouched (no frontend, no outbound request, no new environment key, no upload, no
dependency, no compose or workflow change), K re-checked: no log line is touched,
the new tests carry the mock topic `stoerdesk-stored` and `example.org`-style mock
users only and the entropy assertion is a format match. No new finding.

own-topic-test pass: 2026-11-18, diff `ce79f4a..` (WP-M14-121 — `apps/api/src/notifications/routes.ts`,
`apps/web/src/settings/notifications-page.tsx` and the two touched tests) — areas A
and B re-checked in full (the route table gains `POST
/api/v1/notifications/accounts/ntfy/test`, guarded by the session only — no
permission key, no bearer scope, no public capability, so the guard answers
`401 session_invalid` before anything is read; the user id comes from the session
and enters the select only as a drizzle-bound `eq` pair; the settings page keeps
`RequireSession`), C re-checked for the touched route: the new select reads only
the `externalId` column of `notificationAccounts` under the session-bound
predicate, the request body is never parsed at all — a client-supplied topic can
never enter the send — and the topic reaches the adapter only through the
existing `sendTestMessage` options on the stored topic, D re-checked for the
settings page (the button sends an empty JSON body, the topic of the card never
travels in a request again), K re-checked: no log line touched, the new tests
carry the mock topics `stoerdesk-stored`/`stoerdesk-other` and mock users only.
No new finding.

1. `git ls-files` — the full file list; every area is worked along this list.
2. Area A Authentication: login/logout, cookie & session token handling, token
   entropy + storage, expiry, logout destroy, test/probe routes.
3. Area B Autorisation: route table (below) — Method, Pfad, Guard, note; every
   guarded route needs its `requirePermission`/capability preHandler; public routes
   are only the documented capability routes (IDOR check: objectNo, ticketId,
   photoId, status_token).
4. Area C Input/Injection: zod schemas, LIKE/SQL interpolation (drizzle binds
   values), path/filename construction, data-URL upload, body limits, header
   parsing, no HTML assembly, XSS on user content.
5. Area D Frontend: token storage in the PWA, CSP/HSTS, service worker cache.
6. Area E HTTP-Hardening: helmet, CORS origin list, reverse-proxy headers, TLS.
7. Area F Secrets/Config: `.env` ignored, `.env.example` placeholders, compose
   `:?` required secrets, `.github` no secret echo, dependabot.
8. Area G Files/Uploads: uploads volume, magic-byte validation, path joins.
9. Area H Dependencies: `npm audit` root + `apps/api` + `apps/web` +
   `packages/shared`.
10. Area I Docker/Compose: runtime uid, volumes, proxy headers.
11. Area J CI/CD: workflow env, pinned actions, secret scope.
12. Area K Logging/PII: log calls carry codes, no contact/email/phone params,
   no token in log lines.

Findings format (in `.security/findings.md`): `SEC-nnn` + short title; lines
`Fundstelle` (file:line), `Severity` (hoch|mittel|niedrig), `Status` (open|fixed),
`Attack path`, `Fix`.

## Route table (checked structure — B)

Complete at the repeat pass: 91 routes, 78 guarded by `requirePermission`, 2 by
`requireUser`, 1 test-only probe, 11 public.

| Method | Pfad | Guard / Capability |
| --- | --- | --- |
| POST | /api/v1/auth/login | public (rate limit by IP) |
| POST | /api/v1/auth/logout | session cookie destroy |
| GET | /api/v1/me | requireUser |
| PATCH | /api/v1/users/me | requireUser |
| GET/POST/PATCH | /api/v1/users[/:id] | user.read / user.write |
| GET/POST/PATCH/DELETE | /api/v1/roles[/:key] | role.read / role.write |
| GET/POST/PATCH/DELETE | /api/v1/groups[/:id] | user.read / user.write |
| GET/PUT | /api/v1/settings/branding | settings.read / settings.write |
| GET | /api/v1/settings/title-switch | ticket.create |
| GET/PUT | /api/v1/settings/deadlines | settings.read / settings.write |
| GET/PUT | /api/v1/settings/oncall | settings.read / settings.write |
| GET/POST/PATCH/DELETE | /api/v1/text-templates[/:id] | settings.read / settings.write |
| GET/POST/PATCH/DELETE | /api/v1/admin/statuses[/:key] | settings.read / settings.write (apps/api/src/tickets/status-routes.ts) |
| GET/POST/PATCH/DELETE | /api/v1/admin/transitions[/:id] | settings.read / settings.write (apps/api/src/tickets/transition-routes.ts) |
| GET | /api/v1/public/text-templates | public catalog (active only) |
| GET/POST/PATCH/DELETE | /api/v1/objects[/:objectNo] | object.read / object.write / object.delete |
| POST | /api/v1/objects/import and /api/v1/objects/import/preview | object.import (objects/import-routes.ts:42) |
| POST | /api/v1/objects/:objectNo/regenerate-qr | object.regenerate_qr (objects/qr.ts:164) |
| GET | /api/v1/public/qr/:token | public QR resolve |
| GET/POST/PATCH/DELETE | /api/v1/oncall/pools[/:id] | oncall.read / oncall.admin |
| GET | /api/v1/oncall/pools/:id/members | oncall.read |
| GET/POST/PATCH/DELETE | /api/v1/oncall/shifts[/:id] | oncall.read / oncall.plan / oncall.admin |
| POST | /api/v1/oncall/shifts/generate | oncall.plan |
| POST | /api/v1/oncall/shifts/:id/{confirm,decline} | oncall.confirm (+ service-level owner/admin check) |
| POST | /api/v1/oncall/shifts/:id/swap | oncall.swap (+ service: must own the shift) |
| GET | /api/v1/oncall/swaps | oncall.admin |
| POST | /api/v1/oncall/swaps/:id/{accept,approve,reject,cancel} | oncall.swap / oncall.admin (service-level pool-member and self checks) |
| GET | /api/v1/oncall/warnings | oncall.read |
| GET | /api/v1/oncall/ical-url | oncall.read |
| GET | /api/v1/oncall/ical/:token.ics | public (HMAC capability) |
| GET/POST/PATCH/DELETE | /api/v1/admin/bma-sync/* | object.read / object.import / object.write |
| GET/POST | /api/v1/admin/update/* | system.update |
| POST | /api/v1/tickets | ticket.create |
| GET | /api/v1/tickets | ticket.read (list) |
| GET | /api/v1/tickets/:ticketNo | ticket.read (detail) |
| POST | /api/v1/tickets/:ticketNo/comments | ticket.comment |
| GET | /api/v1/tickets/:ticketNo/photos/:photoId | ticket.read |
| DELETE | /api/v1/tickets/:ticketNo | ticket.delete |
| GET/POST | /api/v1/privacy/tickets/:ticketNo/{export,erase} | user.write (apps/api/src/privacy/routes.ts) |
| POST | /api/v1/tickets/:ticketNo/pause\|resume | ticket.review |
| POST | /api/v1/tickets/:ticketNo/{review,work-order,assign,offer,claim,accept,decline,acknowledge,close,reopen,cancel,uncancel} | workflow routes, ticket.* per route |
| POST | /api/v1/public/tickets | public report (IP+QR-token throttle) |
| GET/POST | /api/v1/public/tickets[/open\|:ticketNo/comments] | public duplicate hint (QR-token capability) |
| GET | /api/v1/public/tickets/:token/status | public status (status_token capability) |
| POST | /api/v1/public/altcha/challenge | public altcha (verification runs inline in the report handler) |
| GET | /api/v1/_test/require-permission/:keys | test-only (NODE_ENV=test, index.ts:148) |
| GET | /api/v1/notifications/status | notification.read (notifications/routes.ts) |
| GET | /api/v1/health | public health |

IDOR keys checked: `objectNo` (DB-bound), `ticketId`/`ticketNo` (DB-bound),
`photoId` (randomUUID), `statusToken`/`qrToken` (capability, 256-bit random).

## Coverage

| Area | Status | checked-at |
| --- | --- | --- |
| A Authentication | complete (own-topic-test pass: the new own-topic route stays session-guarded only and the user id comes from the session; status-admin pass: the four new admin routes stay session-guarded, no session handling changed; transition-administration pass: the four new admin routes stay session-guarded as well; transition-ui pass: no session handling changed, the client route `/admin/transitions` only wraps the page in the existing `RequireSession`; ntfy-subscription pass: no session handling changed, the existing ntfy subscription route stays session-guarded only and takes the user id from the session; ticket-number-counter pass: the diff adds no route and changes no session handling — the migration and the Drizzle mirror of the ticket-number counter are DDL only) | efb7e2b1 |
| B Autorisation | complete (own-topic-test pass: the route table gains `POST /api/v1/notifications/accounts/ntfy/test` behind the session only, no permission key and no bearer scope; status-admin pass: the route table gains `GET`, `POST`, `PATCH`, `DELETE /api/v1/admin/statuses[/:key]` with the `settings.read`/`settings.write` preHandler, no public capability and no bearer scope; transition-administration pass: the route table gains the four `/api/v1/admin/transitions[/:id]` rows with the same guards; transition-ui pass: the API route table is unchanged, the client route table gains `/admin/transitions` behind `RequireSession`; ntfy-subscription pass: no new route, the subscription route stays session-guarded only with no permission key and no bearer scope; ticket-number-counter pass: the route table is unchanged — no new route, no permission key and no bearer scope) | efb7e2b1 |
| C Injection | complete (own-topic-test pass: the new select reads the `externalId` column under the session-bound `eq` pair and the request body is never parsed; re-checked for the changed files at the transition-administration pass: the two bodies pass through the local request schemas, the `:id` path parameter is format-checked by `z.uuid()` before any select and otherwise enters only a drizzle-bound `eq`, every insert/update/delete and both existence probes bind their values through drizzle, an unknown status key answers before any write and a duplicate `(from_status, event_key)` maps SQLSTATE 23505 to `409 transition_duplicate`; transition-ui pass: the page binds both status keys to `ticketStatusKeySchema` and the event key to `ticketTransitionEventKeySchema` before it sends the body and never assembles SQL, a path or a URL from client input; ntfy-topic pass: `newNtfyTopic()` is 128 random hex bits from `node:crypto`, `storeAccount` and `ntfyRecipients` keep every value drizzle-bound, no interpolation and no new select; ntfy-subscription pass: the new select reads the `external_id` column only under the session-bound `eq` pair, the provisioning write is the drizzle-bound upsert of `storeAccount`, the GET carries no body and no parameter at all; ticket-number-counter pass: the diff touches the database layer only — migration `0048_ticket_no_counter_global.sql` is literal SQL without a request value, `next_ticket_no()` allocates over the constant key `global`, the Drizzle mirror binds no new value and the integration spec writes the mock numbers `ST-1999-0001` and the allocated ones only) | efb7e2b1 |
| D Frontend | complete (transition-ui pass: the page renders the row identity and the machine keys only, no token, secret, cookie or account value enters the DOM and the PWA stores nothing new) | 587f7ad |
| E HTTP-Hardening | complete (outbound ntfy request carries a timeout, WP-M14-53) | c65ce2d |
| F Secrets/Config | complete (no gh-secret CLI run — compose + workflows read; re-checked at the ntfy-timeout pass) | c65ce2d |
| G Files/Uploads | complete (re-checked for the changed files) | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| H Dependencies | complete (npm audit: the runtime tree is clean — `npm audit --omit=dev` reports 0; the advisories are dev-only build tools and are not installed in the runtime image; ticket-number-counter pass: no dependency changed in this diff, but `npm audit --omit=dev` now reports 4 advisories — 1 high in `@fastify/static` (authorization bypass and route-guard bypass through non-canonical URL paths and path traversal) reached through `@fastify/swagger-ui`, and 3 moderate in the transitive `glob`/`minimatch`; the finding is open in `.security/findings.md` and the fix is a dependency bump of its own) | efb7e2b1 |
| I Docker/Compose | complete (ntfy-topic pass: the `backup` service mounts `ntfydata` read-only, no host port added, no secret on a command line) | 4abe93f |
| J CI/CD | complete | 249c8a006e472e77fd58bfc855fa8caf578fecdf |
| K Logging/PII | complete (re-checked for the changed files at the transition-administration pass: no log line, no contact value, the answer carries the row identity, the two machine keys, the event key, the stored `condition` record, the `active` flag and the `updatedAt` timestamp only; transition-ui pass: no log line, the page test carries mock machine keys, mock UUIDs and an
`example.com` e-mail only; ntfy-topic pass: no log line touched, the specs carry mock topics
only and the adapter keeps logging the topic of a send (deviation recorded in
`.security/findings.md`); ntfy-subscription pass: no log line touched, the tests
carry the mock topic `stoerdesk-stored` and format assertions only; own-topic-test pass: no log line touched, the tests carry the mock topics `stoerdesk-stored`/`stoerdesk-other` only; ticket-number-counter pass: no log line added, the migration writes no log, the integration spec carries the mock ticket number `ST-1999-0001` and the allocated numbers only — no name, no phone number, no e-mail and no IP) | efb7e2b1 |

Missing scanners: none needed — the repo ships `npm audit` (used); no dedicated
secret scanner is configured (covered by compose/workflow reads; a future
pass may add one).

## Repeat run

- `checked-at` = audit SHA above. On a repeat: `git diff --name-only <SHA>..HEAD`.
- A and B are always re-checked in full.
- C–K: re-check only the files that changed in that diff.
- `fixed` findings: re-check their fundstelle only if it changed in that diff.
- H re-runs `npm audit`; J re-checks dependabot config.
