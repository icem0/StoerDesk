# WP-M12-02: Acceptance end-to-end suite for items 1–12

format: small-model
status: done
depends-on: WP-M12-01
phase: 12
milestone: m12
context-budget: 28k tokens
spec: specs/16-acceptance.md §16.1 (items 1–12), §16.2 (surfaces), §16.3; PLAN.md §18, §18.2
spec-lines: 134

files-read:

- specs/16-acceptance.md (the criteria, the mapping and the open verification points)
- scripts/e2e-check.mjs (harness helpers to reuse: browserProbe, throwaway database
  `stoerdesk_e2e_<run>`, withDatabase, createDatabase/dropDatabase, the migrate +
  seed-rbac + seed-base chain, the CI-strict skip rule, the `E2E_*` env)
- apps/web/e2e/offline-report.spec.ts (the flight-mode pattern, WP-M2-09b)
- apps/api/src/stats/__tests__/phase9-exit.integration.spec.ts (seeded reference data
  and the printed median)
- apps/api/src/oncall/__tests__/phase8-exit.integration.spec.ts (DST weeks, atomic swap)
- apps/api/src/tickets/__tests__/escalation-exit.integration.spec.ts (deadline rule)

files-write:

- scripts/e2e-acceptance.mjs (the runner; already present from the earlier runs, repaired here)
- apps/api/src/tickets/workflow.ts (the defect behind item 5)
- apps/api/src/tickets/__tests__/workflow-columns.integration.spec.ts (new regression test)
- work-packages/m12/02-acceptance-e2e-suite.md (this file)

interfaces:

- `npm run wp:check` sees this document; the suite runs as
  `node scripts/e2e-acceptance.mjs` (no new gate is wired into `npm run check`)
- the suite prints one line per item `PASS`/`FAIL`/`UNVERIFIED` and a summary
  `acceptance: N/12 verified`

## Task

1. Create `scripts/e2e-acceptance.mjs`: reuse the harness shape of
   `scripts/e2e-check.mjs` — throwaway database, migrate + seed-rbac + seed-base
   preparation, Chromium probe, `CI=true` strictness (a missing prerequisite is an
   error there, unverified elsewhere, never a green skip).
2. Drive the twelve items of `specs/16-acceptance.md` §16.1 in one ordered run
   against the throwaway database and the running API/web pair: QR report with two
   photos and the office list/notification, flight-mode offline report
   (`setOffline(true)` pattern of WP-M2-09b, exactly one ticket, `reported_at` =
   capture time), competing claim, decline without reason, acknowledge with note
   and photo, escalation after the configured deadline, object API upsert/update/
   deactivate with an invalid payload, counter reset and `is_test` exclusion
   (the test flag of WP-M9-02), median against `db/seed-stats-reference`, failing
   channel retry + fallback visible in history and on the dashboard, web-push
   delivery on the channel side, on-call DST slots + decline + atomic swap +
   on-call-first offer + `unstaffed` warning.
3. Reuse existing test flags and env only (`NODE_ENV=test`, `tickets.is_test`
   rows, `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`/`E2E_API_PORT`/`E2E_WEB_PORT`) —
   no new secrets, no PII, no plaintext contact data in the run output.
4. Item 11 is scoped to the delivery side: the push-subscription registration of
   the web app is not implemented, so the browser side is reported `UNVERIFIED`
   by design, never `PASS` (`PLAN.md` §18, `specs/16-acceptance.md` §16.2/11).
5. Report the summary line and the per-item verdicts in the commit handoff; close
   the open verification points of §16.3 (item 5 office path, item 1 timing) —
   a red verdict is a defect to fix in a new commit, never a weakened suite.

## Non-goals

- No new product feature, no route, schema, UI or settings change.
- No push-subscription registration in the web app (out of scope, stays unverified).
- No weakening, silencing or skipping of an existing gate or test.
- No phase-11 or older work.

## Acceptance

```bash
npm run wp:check
node scripts/e2e-acceptance.mjs
```

Expected: `wp:check` green; the suite prints one verdict per item and the summary
`acceptance: 11/12 verified` — the eleven provable items `PASS`, item 11
`UNVERIFIED` by design until the browser-side push registration exists, reported
as such, never as a green skip. In a developer container without Chromium or
PostgreSQL the browser- or stack-driven items print the unverified notice with
the reason. `npm run check` stays untouched and green.

## Handoff

- Files changed: `scripts/e2e-acceptance.mjs`, `apps/api/src/tickets/workflow.ts`,
  `apps/api/src/tickets/__tests__/workflow-columns.integration.spec.ts`, this
  document and the backlog/plan/changelog/repo-map bookkeeping
- Interfaces added: none in the product — the runner of §16.3 only
- Verified: `node scripts/e2e-acceptance.mjs` prints `acceptance: 11/12 verified`
  (items 1–10 and 12 `PASS`, item 11 `UNVERIFIED` by design, exit 0); `npm run
  wp:check`, typecheck, lint, `vitest run` and `i18n:check` are green
- Deviation: item 5 was a real product defect, not a runner defect — the workflow
  transition never wrote `acknowledged_at`, so the timeline of an acknowledged
  ticket never stopped. `transitionTicket` now writes the workflow columns of
  `PLAN.md` §7 for its milestones (`review_started_at`/`reviewed_by_user_id`,
  `work_order_type`/`work_order_number`, `accepted_at`, `acknowledged_at`,
  `closed_at`) in the same statement as the status; the new integration test
  `workflow-columns.integration.spec.ts` proves it. This is the WP's only product
  change: the non-goal "no product change" is overridden by the rule that a red
  verdict is a defect to fix, never a suite to weaken.
- Deviation: the runner treated the disabled acknowledge confirm button of the stage
  selection (WP-M13-09) as clickable and aborted the whole run on the first error.
  It now asserts the button stays disabled, and one unexpected error is that item's
  `FAIL` instead of leaving the remaining items without a verdict.
- Follow-up WP: none
- Open question: none
