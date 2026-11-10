# WP-M9-39: the dashboard stream captures its baseline before the first snapshot

format: small-model
status: done
depends-on: WP-M9-07
phase: 9
milestone: m9
context-budget: 12k tokens
spec: specs/11-dashboard.md §11.6; ADR-0012 decision 1
spec-lines: 20

files-read:

- apps/api/src/dashboard/stream.ts (the probe and the first snapshot)
- apps/api/src/dashboard/__tests__/dashboardStream.integration.spec.ts (the stream test)
- docs/DECISIONS/0012-dashboard-live-updates-and-statistics.md (decision 1)
- specs/11-dashboard.md (§11.6 the stream contract)

files-write:

- apps/api/src/dashboard/stream.ts

interfaces:

- `registerDashboardStream(app, { database })` — unchanged; the baseline is captured before the first snapshot

## Task

1. Capture the probe baseline **before** the first snapshot leaves the server.
   A change that lands between the snapshot and the baseline was swallowed:
   the client already held the older snapshot and the probe compared against a
   value that already contained the change, so no second snapshot followed.
2. Prove the order with the existing stream test: it inserts a ticket right
   after the first snapshot and waits for the second one, so it fails when the
   baseline is captured too late.

## Non-goals

- No change of the probe interval, the heartbeat or the snapshot content.
- No event-driven push; the five-second probe stays (ADR-0012 decision 1).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the stream test is stable under a delayed baseline.

## Handoff

- Files changed: the stream; the existing stream test is the regression test
- Interfaces added: none
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: none
- Open question: none

## Record

The dashboard SSE stream sent its first snapshot **before** it captured the
probe baseline. The client receives the snapshot and reacts to it — the
integration test inserts a ticket right away — while the baseline query is
still running. When the insert committed before that query read the table, the
baseline already contained the change, the probe saw no difference and no
second snapshot was sent: the client waited for a snapshot that never came.

The window is one database round trip. On a developer machine it is a
millisecond and the test passes; on a loaded CI runner it grew past the five
second test budget and the run failed with a timeout in
`dashboardStream.integration.spec.ts` while the rest of the suite passed. The
order is the defect, not the interval: a change that arrives while a client
reacts to the first snapshot was dropped in production too.

Capturing the baseline first closes the window. A change that arrives after
the baseline is always visible to the probe, and a change that arrives between
the baseline and the snapshot is delivered twice — which the client simply
ignores.

The test proves the order: with the old order and a 300 ms delay between the
snapshot and the baseline it fails with the same five second timeout as the
CI run; with the new order the same delay passes in 416 ms.
