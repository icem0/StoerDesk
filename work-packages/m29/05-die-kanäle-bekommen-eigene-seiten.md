# WP-M29-05: die Kanäle bekommen eigene Seiten

format: ctx-256k
status: planned
depends-on: WP-M29-04
phase: 29
milestone: m29
context-budget: 48k tokens
spec: specs/13-ui.md §14.11; PLAN.md §14
spec-lines: 50
changed-lines: 780

files-read:

- specs/13-ui.md §14.11 (die Verwaltungsseiten)
- PLAN.md §14 (Benutzeroberfläche)
- apps/web/src/admin/channels-page.tsx (heute alle Kanäle auf einer Seite, WP-M14-06)
- apps/web/src/admin/__tests__/channels-page.test.tsx (die Tests der Kanalseite)
- apps/web/src/routes/index.tsx (die Routentabelle)

files-write:

- apps/web/src/admin/channel-form-parts.tsx (neu: das Kanalformular als eigene Komponente, aus channels-page.tsx extrahiert)
- apps/web/src/admin/channels-page.tsx (die Kanal-Karten aus dem Formular extrahiert, Import von channel-form-parts)
- apps/web/src/admin/channel-page.tsx (neu: die Seite eines Kanals unter /admin/channels/:kind)
- apps/web/src/admin/__tests__/channel-page.test.tsx (neu)
- apps/web/src/routes/index.tsx (die Route /admin/channels/:kind)
- CHANGELOG.md
- work-packages/m29/05-die-kanäle-bekommen-eigene-seiten.md (dieses Dokument)

interfaces:

- `GET /admin/channels/:kind` — die Einstellseite eines Kanals (Matrix mit Homeserver und Raum, ntfy, Telegram, Signal, E-Mail, WebPush, WhatsApp)
- `ChannelCard({ channel, mayWrite })` — das Formular eines Kanals, jetzt in channel-form-parts.tsx und von dort wiederverwendbar

## Task

1. `apps/web/src/admin/channel-form-parts.tsx`: das Kanalformular (Felder, Geheimnis, Testsendung, ntfy-CURL, Verifizierung, Speichern) als Komponente `ChannelCard` extrahiert aus channels-page.tsx, zusammen mit CHANNEL_FIELDS, fieldId, buildNtfyCurl, makeReasonOf und errorCode.
2. `apps/web/src/admin/channels-page.tsx`: importiert ChannelCard aus channel-form-parts.tsx; die lokale Definition entfällt. Das Verhalten der Seite ändert sich nicht.
3. `apps/web/src/admin/channel-page.tsx`: die Seite `/admin/channels/:kind` lädt die Kanal-Konfiguration von `GET /api/v1/admin/channels`, findet den Kanal nach seiner Art und rendert ChannelCard; ein unbekannter Kanal meldet sich als nicht gefunden.
4. `apps/web/src/routes/index.tsx`: die Route `/admin/channels/:kind` unter `RequireSession`.
5. `apps/web/src/admin/__tests__/channel-page.test.tsx`: die Matrix-Seite zeigt Homeserver und Raum; ein unbekannter Kanal zeigt „nicht gefunden“.

## Non-goals

- Die Übersichtsseite der Kanäle (WP-M29-05b): channels-page.tsx listet in diesem Paket noch alle Kanäle auf einer Seite; die Verlinkung von der Übersicht auf die Einzel-Seiten kommt danach.
- Die Zustellungsseite, die Mailbox, die Webhooks, die API-Schlüssel und der BMAcloud-Abgleich behalten ihre eigenen Seiten.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it; channels-page.test.tsx passes unchanged (die Kanalseite verhält sich gleich).

## Handoff

- Files changed: channel-form-parts.tsx, channels-page.tsx, channel-page.tsx, channel-page.test.tsx, routes/index.tsx
- Interfaces added: ChannelCard, ChannelPage, route GET /admin/channels/:kind
- Verified: the commands above
- Follow-up WP: WP-M29-05b (die Übersichtsseite der Kanäle verlinkt auf die Einzel-Seiten)
- Open question: none
