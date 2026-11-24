# WP-M24-21: the code reaches the channel of the installation

format: ctx-256k
status: done
depends-on: WP-M24-08
phase: 24
milestone: m24
context-budget: 40k tokens
spec: specs/10-notifications.md §11.2, §11.3a, ADR-0022
spec-lines: 60
changed-lines: 560

files-read:

- specs/10-notifications.md §11.2 (where the configuration lives), §11.3a (the confirmation of an account)
- docs/DECISIONS/0022-ntfy-access-token-as-the-channel-secret.md (the access token of the ntfy server)
- apps/api/src/notifications/confirmation.ts (the service of the confirmation)
- apps/api/src/notifications/config.ts (the effective configuration of the channels)
- apps/api/src/notifications/verification.ts (the effective ntfy target)
- apps/api/src/notifications/routes.ts (the route of the confirmation)
- apps/web/src/settings/notifications-page.tsx (the own page of the channels)
- apps/web/src/i18n/locales/de/common.json (the texts of the namespace `common`)

files-write:

- apps/api/src/notifications/config.ts
- apps/api/src/notifications/confirmation.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/__tests__/confirmation.integration.spec.ts
- apps/api/src/notifications/__tests__/config.unit.spec.ts
- apps/web/src/settings/notifications-page.tsx
- apps/web/src/settings/__tests__/notifications-page.test.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- work-packages/m24/21-the-code-reaches-the-channel-of-the-installation.md

interfaces:

- `readEffectiveChannel(database, env, kind): Promise<{ config: Record<string, string>; secret: string }>` — the effective configuration of one kind with its secret
- `ConfirmationError.causeCode` — the machine code of the refusal of the channel
- `POST /api/v1/notifications/accounts/:channel/verification` — `502 send_failed` with `params.reason`, `422 channel_not_configured`
- `common:notifications.errors.reasons.*` — the texts of the causes of a refused send

## Task

The button „Code senden" of the own page sends the one-time code of §11.3a
over the channel of the account. The code went to the **environment** alone
(`NTFY_URL`, `NTFY_TOPIC`, `NTFY_TOKEN`, …): a ntfy server that the
administration configured in the administration (a self-hosted server with
access control, ADR-0024) never received the code — the publish went to the
server of the environment, without its access token, and the page answered a
flat `invalid_request`, indistinguishable from a wrong code.

1. **The effective configuration** `apps/api/src/notifications/config.ts`:
   `readEffectiveChannel(database, env, kind)` reads the row of
   `notification_channels` and merges it over the environment (§11.2): the row
   wins, an empty value of the row falls back to the environment, the VAPID
   trio stays one value (WP-M14-158) and WhatsApp Web exists only through its
   row (ADR-0020). The secret stays inside the server (§11.13).
2. **The service** `apps/api/src/notifications/confirmation.ts`: the send of the
   code uses the effective configuration of the administration for **every**
   kind — the ntfy target with its access token (`effectiveNtfyConfig`), the
   bot token of Telegram, the homeserver of Matrix, the SMTP settings of the
   mail, the bridge of WhatsApp Web. The target stays the target of the
   **user**: the topic of his ntfy account, the chat of his account, the room
   of his account, his mail address and — for the web push — only the devices
   of his own account (ADR-0045). Before, the web push sent the code to every
   device of the installation.
3. **The answer** `apps/api/src/notifications/routes.ts`: a channel that is not
   configured answers `422 channel_not_configured`, a channel that refused the
   code answers `502 send_failed` with the machine code of the refusal in
   `params.reason` (`http_403`, `http_timeout`, …) — the shape of the
   verification of the administration. The wrong and the expired code of the
   confirmation step keep the `422 invalid_request` of §11.3a.
4. **The page** `apps/web/src/settings/notifications-page.tsx`: the refusal of
   the send names its cause — the text of the reason of the channel, or the
   machine code of a reason without a text. The texts live in the namespace
   `common` (`notifications.errors.send_failed`, `notifications.errors.reasons.*`).
5. **The tests**: the integration test sends the code to the server of the
   administration (the row wins over the environment, the access token travels
   in the `Authorization` header), the refused send names its cause, and the
   code of the web push reaches only the devices of the user; the unit test
   proves the precedence of the effective configuration; the test of the page
   shows the cause of a refused send.

## Non-goals

- No change of the chain of the delivery: the chain of the outbox is still
  built from the environment (`configuredChannels`), except for ntfy.
- No change of the verification of the administration — it already uses the
  effective ntfy target.
- No new channel, no new transport, no change of the templates of the mail.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the nine files above
- Interfaces added: `readEffectiveChannel`, the cause of a refused send
- Verified: `npm run check` green (typecheck, lint, the tests of the API and
  the web, i18n, wp-check); the E2E of the run needs the ports of the
  Playwright runner — a second runner in the same working tree takes them and
  the run fails with `object_no_taken` of the other database
- Follow-up WP: none
- Open question: none
