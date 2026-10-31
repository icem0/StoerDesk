# WP-M2-05: Public report form at /m/:token

format: small-model
status: implemented
depends-on: WP-M2-04b
phase: 2
context-budget: 28k tokens
spec: specs/06-report-form.md §7.1–§7.3 (notice, fields, endpoint), specs/08-objects-api.md §9.2 (public QR resolve), PLAN.md §2 (112 notice), §10 (one screen, confirmation), §14 (mobile-first, 44 px)
spec-lines: 140

files-read:

- specs/06-report-form.md (§7.1 notice, §7.2 fields, §7.3 request/response/error codes)
- PLAN.md (§2 emergency notice, §10 report form, §14 UI requirements)
- packages/shared/src/schemas/ticket.ts (`publicReportRequestSchema`, `publicReportContactSchema`, `PublicReport`)
- packages/shared/src/schemas/object.ts (`qrResolveResponse`, `qrTokenSchema`, `PublicQrObject`)
- packages/shared/src/seed/standard-texts.ts (`STANDARD_TEXT_KEYS`, `STANDARD_TEXTS`)
- apps/web/src/routes/index.tsx (route table, `RequireSession` children)

files-write:

- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/routes/index.tsx

interfaces:

- `ReportFormPage()` — public route `/m/:token`, no `Shell`, no `RequireSession`
- `usePublicQr(token)` — `GET /v1/public/qr/:token` as `['public-qr', token]`; the submit
  body always carries the **current** token of the resolve answer (§7.3)
- submit body is a `PublicReportRequest`: `clientUuid` is one UUID v4 per opened form
  (`useState(() => crypto.randomUUID())`), `locale` is `i18n.language`, `reportedAt` the
  device capture time, `photos: []` (WP-M2-05b fills it)
- `POST /v1/public/tickets`; every `ApiError.code` maps to `ticket:report.errors.<code>`
- confirmation replaces the form: `ticketNo`, `deadlineAt`, the `/s/<statusToken>` link
  and the `clockSkewed` notice

## Task

1. `apps/web/src/routes/index.tsx`: add `/m/:token` as a **top level** route next to the
   `App`/`Shell` children. A reporter arriving from a QR code must never see the login
   form of the shell.
2. `report-form-page.tsx`: parse `useParams().token` with `qrTokenSchema` — an invalid
   token renders `ticket:report.errors.qrTokenInvalid` and sends no request; otherwise
   resolve the token and render loading, the 404 notice `qr_token_not_found` or the form.
3. Sub-components in that file, all texts from the `ticket` namespace:
   `ObjectHeader` (name, object number, address), `SystemSelect` (prefilled when the
   object has exactly one system, `none` clears it, options are that object's systems
   only), `FaultChips` (multi-select buttons over `STANDARD_TEXT_KEYS`, labels from
   `STANDARD_TEXTS[locale]`, `aria-pressed`), `FreeText` (max. 4000 chars with counter),
   `ContactFields` (name, phone, e-mail plus the privacy notice of §15).
4. Client rules mirror the server `422`s so the user sees them before the round trip:
   text **or** at least one chip (`report.validation.faultOrText`), phone **or** e-mail
   (`report.validation.contactRequired`), e-mail format through
   `publicReportContactSchema.safeParse`. The 112 notice sits directly above the send
   button; every control is at least 44 px tall (PLAN §14).
5. On success render the confirmation (§7.3.4): the ticket number, the deadline, the link
   to `/s/<statusToken>` and, when `clockSkewed`, `report.done.clockSkewed`.
6. i18n: the `ticket` namespace is empty until now and gains `report.*` in `de` and `en`.
   Test (fixture, outside the file budget)
   `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx` with a stubbed
   `fetch`: prefilled header plus the nine chips in `de` and in `en`, the two client
   rules, the captured submit body (current token, UUID `clientUuid`, text, chip keys,
   locale) and the confirmation with `ST-<year>-NNNN` plus the status link, and the
   `qr_token_not_found` notice.

## Non-goals

- No photo upload and no canvas compression — **WP-M2-05b**; its E2E proof is
  **WP-M2-05c**.
- No status page `/s/:token` — WP-M2-06; the confirmation renders the link, the target
  arrives with that package.
- No offline outbox (Dexie, replay) — WP-M2-09, no honeypot/rate limit — WP-M2-07,
  no duplicate hint — WP-M2-08.
- No public text-template endpoint: the chips use the `STANDARD_TEXTS` catalog that the
  demo seed writes into `text_templates` (§4.5). A DB-backed public catalog would need a
  new endpoint and is phase 10.
- No internal report form (searchable object, priority) — phase 4 ticket UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new web test fails before the page exists and passes after it;
`i18n:check` reports the new `ticket` keys in de and en and no missing reference.

## Handoff

- Files changed: `apps/web/src/features/tickets/report-form-page.tsx` (new),
  `apps/web/src/routes/index.tsx`, the `ticket` locale files (de/en), the bookkeeping
  (`CHANGELOG.md`, `AGENTS.md`, `PLAN.md` §16, `docs/REPO-MAP.md`, `work-packages/README.md`)
  and the fixture `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx`
- Interfaces added: `ReportFormPage`, `usePublicQr(token)`, the `ticket:report.*` keys
- Verified: `npm run test:run` (187 passed), `npm run typecheck --workspaces --if-present`,
  `npm run lint`, `npm run i18n:check` (130 de/en keys) and `npm run wp:check` are green
- Follow-up WP: `05b-report-photo-upload-ui.md` and `05c-report-form-e2e.md` (created in
  the same commit as this rewrite)
- Open question: none
