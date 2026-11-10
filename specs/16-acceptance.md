# 16 — Abnahmekriterien

**Kapitel:** 18 + 19
**Umfang:** ~180 Zeilen
**Status:** mirrored from `PLAN.md` §20 and reviewed for WP-M12-01

> **Mirror note:** The original chapters 18 and 19 were **not supplied** —
> `docs/material/` never carried them. `AGENTS.md` (_Structure discipline_) and
> `specs/README.md` (_Rules_) allow a placeholder slice to be mirrored from
> `PLAN.md` when the original is missing, so this slice mirrors the acceptance
> summary of **`PLAN.md` §20, items 1–12**: the items are quoted and structured,
> nothing is invented and nothing is extended. `PLAN.md` §20 stays the binding
> summary and names this slice as the place of the full, testable criteria. If
> the original chapters arrive later, this slice is re-mirrored from them.

## 16.1 Minimum end-to-end acceptance for the first complete release

Mirrored from `PLAN.md` §20 — "The minimum end-to-end acceptance for the first
complete release":

1. Scan a QR code, submit a report with two photos, see the ticket in the office
   list within 3 s, receive an office notification.
2. Enable flight mode, submit a report, disable flight mode: exactly one ticket
   is created, `reported_at` is the capture time.
3. Two technicians claim the same offer: exactly one wins, the other sees
   "already claimed".
4. Decline without a reason is impossible (UI and API return 422).
5. Acknowledge without a note is impossible; with note and photo the timeline
   stops.
6. An unclaimed ticket escalates after the configured deadline and the event is
   in the history.
7. Object API upsert, update and deactivate works; invalid payload returns 422
   with field errors.
8. The "no malfunction since" counter resets on a new report and ignores test
   tickets.
9. Statistics median matches the reference value from seeded test data.
10. A failed notification channel retries, then falls back; the failure is
    visible in the history and on the dashboard.
11. iPhone test: install to home screen, grant push, receive push while the app
    is closed.
12. On-call calendar: DST slot calculation, decline without reason, atomic swap,
    on-call-first offer, unstaffed warning.

## 16.2 Mapping to the implementation surfaces

Every item maps to surfaces that are **already implemented** — the named files
and work packages are records of `docs/REPO-MAP.md`, no new feature is claimed
here. The mapping is a pointer, not a proof: no single run covers all twelve
items yet (§16.3).

1. **QR report path.** `POST /api/v1/public/tickets` with photo upload:
   `apps/api/src/tickets/{report,photos}.ts` (WP-M2-04b, WP-M2-04c); office list
   `apps/api/src/tickets/list.ts` and `ticket-list-page.tsx` (WP-M2-17b); the
   office notification is enqueued in the create transaction by
   `notifications/outbox.ts` (WP-M7-04); the public status page
   `GET /api/v1/public/tickets/:token/status` and `/s/:token` back it (WP-M2-06).
2. **Offline flight mode.** PWA shell and Dexie outbox
   `apps/web/src/lib/outbox.ts`, `apps/web/src/sw.ts` (WP-M2-09, WP-M2-09a);
   `client_uuid` idempotency in `report.ts` (WP-M2-04b); the report time
   `reportTimes(input, receivedAt?)` keeps the capture time; the E2E
   "flight mode, send, online, exactly one ticket" is
   `apps/web/e2e/offline-report.spec.ts` (WP-M2-09b).
3. **Offer claim.** `POST …/offer` and `…/claim` in
   `apps/api/src/tickets/workflow-routes.ts` (WP-M2-19c; the offer runs through
   the on-call coupling of WP-M8-10); a claim on an already-assigned ticket is
   rejected by the transition rule in `workflow.ts` (`409 invalid_transition`);
   the detail page shows the state.
4. **Decline.** The decline route requires a trimmed `reason` of at least 5
   characters (`DECLINE_REASON` in `workflow-routes.ts`, WP-M2-19c); the UI
   decline panel asks for it (WP-M4-07); offline decline queues through
   `internal-actions.ts` and the Dexie `internal_actions` queue (WP-M5-04,
   WP-M5-06).
5. **Acknowledge.** The acknowledge route carries `result` and an optional
   `note` (WP-M2-19c); `workflow.ts` stops the timeline at `acknowledged`
   (`stopped_at`, `specs/05-timeline.md` §5.2, WP-M6-11); report photos are
   `ticket_photos` rows (WP-M2-04c); offline acknowledge via WP-M5-*. The
   rule "acknowledge without a note is impossible" is an acceptance rule —
   the note is optional on the API contract today; §16.3 names this open
   verification point for the suite.
6. **Escalation.** Per-priority deadline hours and escalation rules as
   settings rows (`settings/deadlines.ts`, WP-M6-14b, ADR-0008); an overdue
   unclaimed ticket escalates with the event rule `deadline_exceeded` and the
   event lands in the ticket history; the phase-6 exit test
   `apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts`
   (WP-M6-13) proves it.
7. **Object API.** CRUD in `apps/api/src/objects/service.ts` (WP-M2-01) and
   the external upsert/bulk/soft-delete in `objects/external.ts` (WP-M10-07);
   the Zod body schemas reject invalid payloads naming the failed field paths,
   a taken `object_no` answers `422 object_no_taken`.
8. **Dashboard counter.** The fault-free counter `resolveFaultFreeCounter` of
   `dashboard/service.ts` (WP-M9-05) reads `stats_tickets` with `is_test =
   false` — the test flag of WP-M9-02 keeps test tickets out — and shows the
   newest qualifying report, so a new report resets it.
9. **Statistics.** The median is `percentile_cont(0.5)` in
   `apps/api/src/stats/reaction-times.ts` (WP-M9-10); the reference test
   `stats/__tests__/phase9-exit.integration.spec.ts` seeds
   `db/seed-stats-reference` and asserts the printed reaction-time median
   (WP-M9-18).
10. **Notification fallback.** `drainOutbox` retries up to three attempts with
    backoff, ends `FAILED` and queues the fallback row of the next channel of
    `escalationChain` (WP-M7-05); the `notification_failed`/`notification_sent`
    events appear in the ticket history; `resolveChannelStatus` shows the
    per-channel outbox state in the dashboard snapshot (WP-M9-05).
11. **PWA push.** The PWA shell is installable to the home screen (WP-M2-09);
    the web-push channel adapter `notifications/channels/web-push.ts` (WP-M7-09,
    ADR-0010) reads the `push_subscriptions` rows (WP-M2-95) and sits last in
    the chain. **Not implemented:** the push-subscription registration in the
    web app (`work-packages/README.md` names it as planned) — item 11 can only
    be proven on the delivery side; the browser side must be reported
    **unverified**, never green (`PLAN.md` §18).
12. **On-call calendar.** DST-safe slot generator `generateOncallSlots` in
    `packages/shared/src/oncall.ts` (WP-M8-03, ADR-0011) with the 167/169/168 h
    weeks in `oncall/__tests__/phase8-exit.integration.spec.ts` (WP-M8-16);
    decline without reason is rejected (`oncall_decline_reason_required`,
    `oncall/confirm.ts`, WP-M8-07); the atomic swap has exactly one winner and
    a `409` loser (`oncall/swaps.ts`, WP-M8-08); the on-call-first offer
    `offerTicket`/`resolveOnCallPerson` in `coupling.ts` (WP-M8-10/11) carries
    the `unstaffed` warning kind.

## 16.3 Verification state and phase-12 split

- Today every item is proven only by its own phase exit criterion or test
  (named in 16.2) — no single run covers items 1–12 end to end. The phase-12
  split announces **WP-M12-02** (`work-packages/m12/02-acceptance-e2e-suite.md`,
  planned): one acceptance suite `scripts/e2e-acceptance.mjs` that reuses the
  Playwright harness helpers of `scripts/e2e-check.mjs` (throwaway database,
  browser probe, CI-strict skip rule) and the existing test flags
  (`tickets.is_test` of WP-M9-02, `NODE_ENV=test`, the `E2E_*` ports).
- The suite reports every item `PASS`/`FAIL`/`UNVERIFIED` and never weakens a
  gate: a missing prerequisite is unverified, never presented as green
  (`PLAN.md` §18.2).
- Open verification points the suite has to close, not new features: the
  acknowledge-note rule of item 5 on the office path (16.2/5), the office-list
  timing of item 1 and the browser-side push of item 11 (16.2/11).
