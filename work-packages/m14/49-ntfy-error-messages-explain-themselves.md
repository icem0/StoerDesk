# WP-M14-49: ein fehlgeschlagener ntfy-Test erklärt sich selbst

format: small-model
status: done
depends-on: WP-M14-47, WP-M14-48
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/10-notifications.md §11.11
spec-lines: 25

files-read:

- apps/web/src/admin/channels-page.tsx (Testnachricht-Karte)
- apps/web/src/i18n/locales/de/settings.json (admin.channels.errors)
- apps/web/src/i18n/locales/en/settings.json (admin.channels.errors)
- apps/api/src/notifications/channels/ntfy.ts (Fehlercode des Adapters)

files-write:

- apps/web/src/admin/{channels-page.tsx,__tests__/channels-page.test.tsx}
- apps/web/src/i18n/locales/{de,en}/settings.json
- apps/api/src/notifications/channels/{ntfy.ts,__tests__/ntfy.test.ts}
- work-packages/m14/49-ntfy-error-messages-explain-themselves.md

interfaces:

- `NtfyError` trägt nun `http_<status>` (z. B. `http_407`) statt nur `http_error`
- Der Fehlercode wird als `params.reason` bei `verification_send_failed` mitgeliefert
- `admin.channels.testFailed` zeigt den übersetzten Grund statt des rohen Codes
- Neue Schlüssel `admin.channels.errors.http_401 … http_504` (de/en)

## Task

1. Der ntfy-Adapter gibt den HTTP-Status als Fehlercode zurück (`http_407` …), damit die Ursache nachvollziehbar ist.
2. Bei einem fehlgeschlagenen Test wird der Grund übersetzt angezeigt: z. B. 407 → das Thema ist bereits vergeben, ein anderes Thema wählen.
3. Auch der Verifikations-Code-Versand übermittelt den Grund an das Frontend.
4. Tests für den Fehlercode und die UI-Ausgabe hinzufügen.

## Non-goals

- Keine Änderung des ntfy-Adapters für andere Fehlerfälle (Auth ist weiterhin nicht unterstützt).
- Keine neuen HTTP-Status-Codes in der API außerhalb des ntfy-Flows.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Ein fehlgeschlagener Test sagt nun, woran es liegt (meist: Thema bereits vergeben bei ntfy.sh → ein anderes Thema wählen).
