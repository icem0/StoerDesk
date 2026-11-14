# WP-M14-48: the admin sees the ntfy state and confirms the code

format: small-model
status: done
depends-on: WP-M14-47
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.1, §11.2, §11.12
spec-lines: 30

files-read:

- specs/10-notifications.md §11.1, §11.2, §11.12
- apps/web/src/admin/channels-page.tsx (channel card)
- apps/web/src/features/settings/NtfySubscription.tsx (QR card)
- apps/web/src/i18n/locales/de/settings.json (admin.channels)

files-write:

- apps/web/src/admin/{channels-page.tsx,__tests__/channels-page.test.tsx}
- apps/web/src/i18n/locales/{de,en}/settings.json

interfaces:

- state badge `unverified` for a usable ntfy channel without a proof
- "Code senden" and "Code bestätigen" against the routes of WP-M14-47
- the admin card shows the subscription QR and address of the saved topic
- a link to the personal subscription page (Einstellungen → Benachrichtigungen)

## Task

1. The state badge no longer says "configured" because a key is stored. An
   enabled ntfy channel without a confirmed code shows "ungeprüft"; only the
   confirmed channel shows "geprüft".
2. The ntfy card explains the setup in three steps: save address and topic,
   subscribe with the QR/address, send the code and enter it back.
3. The card shows the QR code and the subscription address of the saved
   instance topic, plus a link to the personal per-user QR codes.
4. The verification sends the code, shows its deadline and maps wrong, expired
   and send-failure answers to readable German and English texts.
5. A regression test proves the unverified state, the code request and the
   confirm request with the typed code.

## Non-goals

- No change of the API routes or the verification service.
- No new route in the web app.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- The QR of the personal page is unchanged and remains the place where every
  employee subscribes their own topic.
