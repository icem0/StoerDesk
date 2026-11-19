# Web Push (VAPID) einrichten

## Warum fehlt die Konfiguration?

Web Push ist in StörDesk standardmäßig **ausgeschaltet**. Der Kanal sendet erst, wenn drei Werte gesetzt sind:

- `VAPID_PUBLIC_KEY` — öffentlicher Schlüssel, den der Browser empfängt
- `VAPID_PRIVATE_KEY` — privater Schlüssel, mit dem die VAPID-JWT signiert wird
- `VAPID_SUBJECT` — Kontaktadresse (`mailto:` oder `https:`) für den Push-Dienst

Ohne diese drei Werte zeigt die Seite `/notifications` den Hinweis:

> Web Push ist auf diesem Server nicht konfiguriert (die VAPID-Schlüssel fehlen).

Das ist kein Fehler, sondern der gewünschte sichere Zustand: jeder Server braucht sein eigenes Schlüsselpaar, damit der Push-Dienst Geräte eindeutig diesem Server zuordnen kann.

## Schlüssel erzeugen

```bash
npx web-push generate-vapid-keys
```

Das gibt drei Werte aus (Public Key, Private Key, Subject). Kopieren Sie alle drei.

## In `.env` eintragen

Tragen Sie die Werte in Ihre **lokale** `.env` ein (nicht commiten, nicht ins Image bauen):

```
VAPID_PUBLIC_KEY=BLg2...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.org
```

Danach den API-Container neu starten:

```bash
docker compose restart api
```

## Wo die Einstellung sichtbar ist

- **Admin:** unter `/settings/notifications` (Karte „Web Push“) steht, ob der Kanal konfiguriert ist.
- **Nutzer:** unter `/notifications` erscheint der Hinweis, solange die Schlüssel fehlen — the message itself is the link to the guide at /help/web-push.
- **Guide in the app:** under /help/web-push are the same steps as in this document.
- **API:** `GET /api/v1/notifications/accounts/webpush` antwortet mit dem öffentlichen Schlüssel (oder leer, wenn nicht konfiguriert).

## Sicherheit

- `VAPID_PRIVATE_KEY` ist ein Geheimnis. Nie commiten, nie loggen, nie an den Browser senden.
- Die `.env` wird von Docker Compose gelesen und bleibt über Neustarts erhalten.
- Mehrere Installationen auf demselben Host brauchen jeweils eigene Schlüsselpaare.

## Was danach passiert

Sobald die drei Werte gesetzt sind und der API neu gestartet ist:

1. verschwindet der Hinweis unter `/notifications`,
2. der öffentliche Schlüssel wird an den Browser ausgeliefert,
3. Nutzer können sich unter `/settings/notifications` für Push-Benachrichtigungen anmelden,
4. Tickets, Eskalationen und Bereitschafts-Erinnerungen können über Web Push versandt werden.
