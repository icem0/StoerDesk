# 09 — Offline report and sync

**Chapter:** 10
**Status:** filled and reviewed for the phase 3 closure (WP-M2-09, WP-M2-09a,
WP-M2-09b, WP-M3-01)
**Source:** `PLAN.md` §10; the code of `apps/web/src/lib/outbox.ts`,
`apps/web/src/sw.ts`, `apps/web/src/main.tsx` and
`apps/web/src/features/tickets/report-form-page.tsx`

This slice is authoritative for the **public reporter path**. Offline work for
internal users (reading assigned tickets, acknowledging, commenting, declining,
on-call confirmations) is not part of phase 3 and stays with the later phases.

## §9.1 Goal and exit criterion

A malfunction report must be writable without a connection and must become
exactly **one** ticket when the connection returns.

- The PWA shell is precached, so `/m/<token>` loads offline after it was opened
  once.
- A report written offline is persisted in IndexedDB (Dexie) and retried
  automatically.
- The server treats the `client_uuid` of the report as an idempotency key, so a
  repeated delivery returns the existing ticket instead of creating a duplicate.

The phase is done when the Playwright test of WP-M2-09b drives the form offline,
goes online again and finds exactly one open ticket — in `de` and in `en`.

## §9.2 Outbox and enqueue rules

`apps/web/src/lib/outbox.ts` owns one Dexie database (`StörDeskOutbox`) with a
single `outbox` table. A row carries:

| Field         | Meaning                                                    |
| ------------- | ---------------------------------------------------------- |
| `id`          | auto-incremented local key                                 |
| `client_uuid` | idempotency key shared with the server                     |
| `payload`     | the complete `PublicReportRequest` (including photo data)  |
| `status`      | `queued`, `sending`, `sent` or `failed`                    |
| `retries`     | number of delivery attempts                                |
| `created_at`  | local enqueue time, used for oldest-first replay           |

The row is written when:

- `navigator.onLine` is `false` at submit time, or
- the send fails with a network error (not an `ApiError`).

Validation, the spam decision, the 112 notice and the confirmation page keep
their online behaviour (`specs/06-report-form.md`). The form shows the saved
state and the number of waiting reports; a "send now" button is offered while
the device is online.

The compressed photos travel inside the payload as data URLs. The upload limits
of `specs/02-data-model.md` §4.10 (six photos, decoded size cap, magic-byte
check) are enforced by the API exactly as in the online path.

## §9.3 Idempotency and replay

- One `client_uuid` is generated per opened form (`crypto.randomUUID()`) and
  reused for every retry of that report.
- `POST /api/v1/public/tickets` stores the `client_uuid` under a unique index:
  the first delivery answers `201`, a repeat answers `200` with the existing
  ticket. A replay therefore never creates a second ticket, even when the first
  answer was lost on the way back.
- `replayOutbox()` reads the waiting rows oldest first and removes a row after a
  successful delivery. A failed row stays in the outbox and is retried later.
- Replay is triggered on app start, on the window `online` event, by the manual
  button and by the background-sync queue of the service worker.
- Duplicate triggers are harmless because of the idempotency key; they do not
  need a local lock.

## §9.4 PWA shell and service worker

- Vite PWA runs in `injectManifest` mode with `apps/web/src/sw.ts` as the
  source.
- `precacheAndRoute(self.__WB_MANIFEST)` precaches the app shell, JS, CSS,
  icons, locales and the generated `sw.js`; a manifest makes the PWA
  installable.
- The service worker registers a Workbox `BackgroundSyncPlugin` with the tag
  `sync-report` for the public report POST. The route matches the API path
  (`<api-base>/v1/public/tickets`, default `/api/v1/public/tickets`) rather than
  the bare `/v1/...` segment, so a build with an API base still queues the
  request.
- Browsers without Background Sync (notably iOS Safari) are covered by the
  `online` listener and the app-start replay; the manual button remains the
  fallback for the user.

## §9.5 Failure behaviour

- A network failure is not shown as a server error: the report is saved and the
  form reports that it will be sent automatically.
- A server answer (`ApiError`) keeps its error code and parameters; a
  `400 captcha_required` keeps the existing Altcha path of
  `specs/06-report-form.md` §7.6 and is **not** enqueued as a silent success.
- A row whose replay keeps failing remains visible in the outbox; it is never
  dropped silently.
- No offline write may be lost through the clean-update control: the admin
  update page blocks cache clearing while queued or sending rows exist
  (`specs/18-self-update.md` §18.2).

## §9.6 Not part of phase 3

- Stale-while-revalidate caches for object and text-template API responses.
- Offline reading of assigned tickets, the pool, object data and the on-call
  calendar.
- Offline internal writes (acknowledge, comment, decline, confirm/decline a
  shift) and the conflict UI.
- Claiming from the pool and accepting a swap (online only).

These belong to the offline internal actions of the later phases and need their
own work packages.

## §9.7 Acceptance references

- `apps/web/e2e/offline-report.spec.ts` (WP-M2-09b): offline submit, online
  replay, exactly one ticket, `de` and `en`.
- `apps/web/src/lib/__tests__/sw-routes.test.ts` (WP-M3-01): the service-worker
  route matches the public report path and not the status, comment or open-ticket
  routes.
