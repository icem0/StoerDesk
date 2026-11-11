# WP-M12-02: Acceptance end-to-end suite for items 1–12

format: small-model
status: planned
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

- scripts/e2e-acceptance.mjs (new — does not exist yet)
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
`acceptance: 12/12 verified` in CI (item 11 `UNVERIFIED` by design until the
browser side exists — reported as such), or the unverified notice for the missing
prerequisite in a developer container. `npm run check` stays untouched and green.

## Handoff

- Files changed: — (planned: `scripts/e2e-acceptance.mjs` new, this document)
- Interfaces added: none in the product — the runner of §16.3 only
- Verified: pending — this document is the plan, WP-M12-02 runs its own acceptance
- Follow-up WP: none
- Open question: none
