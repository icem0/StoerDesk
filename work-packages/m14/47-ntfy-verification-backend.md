# WP-M14-47: ntfy counts as configured only after the code came back

format: small-model
status: done
depends-on: WP-M14-05, WP-M14-13, WP-M14-45
phase: 14
milestone: m14
context-budget: 30k tokens
spec: specs/10-notifications.md §11.1, §11.2, §11.11
spec-lines: 45

files-read:

- specs/10-notifications.md §11.1, §11.2, §11.11
- apps/api/src/notifications/config.ts (effective configuration)
- apps/api/src/notifications/outbox.ts (enqueue, drain, job)
- apps/api/src/notifications/routes.ts (admin channel routes)
- apps/api/src/db/schema.ts (notification_channels)
- apps/api/src/notifications/telegram-linking.ts (one-time code precedent)

files-write:

- apps/api/src/db/{schema.ts,migrations/0036_notification_verification.sql,migrations/meta/_journal.json}
- apps/api/src/notifications/{config.ts,verification.ts,routes.ts,outbox.ts,__tests__/config.unit.spec.ts,__tests__/routes.unit.spec.ts,__tests__/verification.unit.spec.ts}
- apps/api/src/tickets/{report.ts,internal.ts,__tests__/internal-notification.integration.spec.ts}
- packages/shared/src/{schemas/notification.ts,i18n/server.de.json,i18n/server.en.json}

interfaces:

- table `notification_channel_verifications` (kind, fingerprint, code,
  expires_at, verified_at)
- `POST /api/v1/admin/channels/ntfy/verification` sends a six-character code to
  the effective target and answers `{ expiresAt }`; the code never appears in
  the answer
- `POST /api/v1/admin/channels/ntfy/verification/confirm` with `{ code }`
  answers `{ verified: true }`; wrong, expired and foreign codes are `422`
- `ChannelConfiguration.verified` (shared schema)
- `effectiveNtfyConfig`, `enqueueOutbox(..., ntfy)`, `drainOutbox(..., ntfy)`

## Task

1. A stored or environment ntfy configuration is no longer enough for the
   state "configured". The channel sends a one-time code to the topic and the
   admin enters it back; only then is the target verified (§11.1, §11.2).
2. The effective sender uses the saved configuration, not the environment:
   the outbox, the drain, the ticket enqueue and the admin test send all read
   the values of `readChannelConfiguration`.
3. An unverified ntfy target produces no ticket outbox row. The drain removes
   ntfy from the fallback chain while it is unverified, and the mandatory
   minimum channels skip it.
4. A changed address or topic no longer matches the stored fingerprint, so an
   old proof is invalid without an explicit reset.
5. The verification code is sent with the ntfy JSON contract of the adapter;
   an unreachable server answers `502 verification_send_failed`, never a
   generic `500`.

## Non-goals

- No verification flow for Signal, Matrix, Email, Telegram, Web Push or
  WhatsApp.
- No change of the per-user topic selection of WP-M14-45.
- No change of the ntfy adapter payload.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- The admin UI of the code flow follows in WP-M14-48.
- A deployment with an unverified ntfy target sends no ntfy rows until the
  admin confirms the code; this is intended and visible as `unverified`.
- Integration tests need a database; without one they are reported as skipped,
  never as green.
