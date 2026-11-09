# WP-M9-07: dashboard Server-Sent-Events stream

format: small-model
status: done
depends-on: WP-M9-06
phase: 9
milestone: m9
context-budget: 16k tokens
spec: specs/11-dashboard.md §11.6; ADR-0012 decision 1
spec-lines: 45

files-read:

- specs/11-dashboard.md (§11.6 live updates)
- apps/api/src/dashboard/routes.ts (snapshot route and guards)
- apps/api/src/dashboard/service.ts (snapshot builder)
- apps/api/src/index.ts (rate limit and plugin order)
- apps/api/src/auth/requirePermission.ts (guard reuse)
- apps/api/src/tickets/__tests__/list.routes.integration.spec.ts (stream test setup)

files-write:

- apps/api/src/dashboard/stream.ts
- apps/api/src/dashboard/routes.ts
- apps/api/src/dashboard/__tests__/dashboardStream.integration.spec.ts

interfaces:

- `dashboardChangeProbe(database)` — the five-table `updated_at` probe
- `registerDashboardStream(app, { database })` — `GET /api/v1/dashboard/stream`
- SSE events `dashboard` (snapshot) and `heartbeat`

## Task

1. Add `apps/api/src/dashboard/stream.ts` with the change probe of §11.6: one
   indexed `max(updated_at)` per table over `tickets`, `outbox`,
   `oncall_shifts`, `ticket_pauses` and `settings`, combined into one
   comparable value.
2. Register `GET /api/v1/dashboard/stream` in the dashboard route plugin behind
   `ticket.read`; set `text/event-stream`, disable proxy buffering and send one
   `dashboard` event immediately.
3. Run the probe every five seconds, send a new snapshot only when the probe
   value changed, send a `heartbeat` every 25 seconds, and stop the timers and
   the request on client disconnect so a closed tab leaks no interval.
4. Add a route test with an injected short interval: the first `dashboard` event
   arrives, a ticket update triggers a second event, an unchanged probe sends
   only heartbeats, and a user without `ticket.read` is rejected before the
   stream opens.

## Non-goals

- No `LISTEN/NOTIFY`, no dedicated database connection and no write-path hook.
- No per-user filtering of the snapshot beyond the sections of WP-M9-06.
- No TV stream; the wall display polls (WP-M9-09).
- No client implementation (WP-M9-14).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the stream test uses a fake timer or a short interval and
closes its own connection.

## Handoff

- Files changed: the stream module, the dashboard route plugin, the stream test
- Interfaces added: `GET /api/v1/dashboard/stream` and the probe
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-14 (web `EventSource` consumer with a 30-second fallback)
- Open question: none
