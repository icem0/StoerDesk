# WP-M2-09: Offline report — Dexie outbox and send flow

format: small-model
status: implemented
depends-on: WP-M2-05
phase: 2
milestone: m2
context-budget: 18k tokens
spec: PLAN.md §10 (offline report and sync); specs/09-offline.md is still a placeholder, so PLAN.md §10 is the source of truth
spec-lines: 0

files-read:

- PLAN.md §10
- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/lib/api.ts
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- packages/shared/src/schemas/ticket.ts

files-write:

- apps/web/src/lib/outbox.ts
- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- `enqueueReport(payload: PublicReportRequest): Promise<void>`
- `queuedReports(): Promise<QueuedReport[]>`
- `removeReport(id: number): Promise<void>`
- `replayOutbox(): Promise<{ sent: number; failed: number }>`
- `report.offline.*` i18n keys (de/en)

## Task

The public report form at `/m/:token` works only while online. This WP adds the offline
half of `specs/06-report-form.md` §10 so a reporter can save a report without a
connection and send it later.

1. Add a Dexie database with an `outbox` table (`id`, `client_uuid`, `payload`, `photos`, `status`, `retries`, `created_at`) in `apps/web/src/lib/outbox.ts`, plus the store functions `enqueueReport`, `queuedReports`, `removeReport` and `replayOutbox` (replay posts each payload to `POST /v1/public/tickets` through `apiFetch` and removes successful rows).
2. Wire `ReportFormPage`: when `navigator.onLine` is true the report is sent directly as today; when offline the validated report is stored in the outbox instead and a badge shows how many reports wait ("1 wartet"). A "Jetzt senden" button triggers `replayOutbox()`.
3. Add the `report.offline.*` i18n keys (badge, button, status text) to `de` and `en` `ticket.json` so no literal UI text is added (`i18next/no-literal-string`).
4. Keep the existing online behaviour unchanged: a successful send answers with the confirmation page exactly as before.

## Non-goals

- Service Worker and Workbox precaching (WP-M2-09a).
- Background sync and the `online`-event / app-start replay triggers (WP-M2-09a).
- The Playwright offline E2E test "flugmodus, senden, online, genau 1 Ticket" (WP-M2-09b).
- Reading photos or any other offline internal action (phase 5).

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; the existing report-form unit tests still pass; no new
literal UI string in `apps/web/src`.

## Handoff

- Files changed: `apps/web/src/lib/outbox.ts` (new), `apps/web/src/features/tickets/report-form-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: `enqueueReport`, `queuedReports`, `removeReport`, `replayOutbox`
- Verified: `npm run check` green
- Follow-up WP: WP-M2-09a (service worker + sync) and WP-M2-09b (offline E2E test) — both WP files are created in this same commit
- Open question (if any): none
