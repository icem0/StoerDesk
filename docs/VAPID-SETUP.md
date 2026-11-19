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

Führen Sie den Befehl in einem Terminal aus, in dem Node und npm installiert sind
(`npx` gehört zu npm). In welchem Ordner Sie den Befehl starten, ist egal: er liest
das Projekt nicht, wird nicht mit ihm gestartet und erzeugt jedes Mal ein neues
Schlüsselpaar.

```bash
npx web-push generate-vapid-keys
```

Der Befehl gibt die drei Werte aus (öffentlicher Schlüssel, privater Schlüssel,
Subject) — kopieren Sie alle drei.

### Im Docker-Stack

Dort läuft derselbe Befehl im **API-Container** — dort ist Node installiert und das
Paket `web-push` liegt bereits im Image:

```bash
docker compose exec api npx web-push generate-vapid-keys
```

Der **Web-Container** des Stacks ist nginx und hat kein Node. Ein `docker exec` in
diesen Container endet mit `exec: "npx": executable file not found in $PATH` — der
Befehl gehört in den API-Container oder in ein Terminal auf dem Host.

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
- **Nutzer:** unter `/notifications` erscheint der Hinweis, solange die Schlüssel fehlen — im Zustand `not_configured` ist die Meldung selbst ein Link auf die Anleitung unter `/help/web-push`.
- **Anleitung in der App:** unter `/help/web-push` stehen dieselben Schritte wie in diesem Dokument.
- **API:** `GET /api/v1/notifications/accounts/webpush` antwortet mit dem öffentlichen Schlüssel (oder leer, wenn nicht konfiguriert).

## Sicherheit

- `VAPID_PRIVATE_KEY` ist ein Geheimnis. Nie commiten, nie loggen, nie an den Browser senden.
- Die `.env` wird von Docker Compose gelesen und bleibt über Neustarts erhalten.
- Mehrere Installationen auf demselben Host brauchen jeweils eigene Schlüsselpaare.

## Was danach passiert

Sobald die drei Werte gesetzt sind und die API neu gestartet ist:

1. verschwindet der Hinweis unter `/notifications`,
2. der öffentliche Schlüssel wird an den Browser ausgeliefert,
3. Nutzer können sich unter `/settings/notifications` für Push-Benachrichtigungen anmelden,
4. Tickets, Eskalationen und Bereitschafts-Erinnerungen können über Web Push versandt werden.
