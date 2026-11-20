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

- `VAPID_PRIVATE_KEY` ist ein Geheimnis. Nie committen, nie loggen, nie an den Browser senden.
- Die `.env` wird von Docker Compose gelesen und bleibt über Neustarts erhalten.
- Mehrere Installationen auf demselben Host brauchen jeweils eigene Schlüsselpaare.

## Wenn nichts ankommt: die Diagnose

Bleibt die Zustellung leer, nennt die Seite `/admin/delivery` den **Fehlercode** des Kanals. Im Log der API steht derselbe Code mit der Ursache:

```bash
docker compose logs api --since 24h 2>&1 | grep "notification send failed" | tail -5
```

Die Zeile trägt `code` (der Fehlercode) und `err.message` (die Ursache in einem Satz):

| Fehlercode | Ursache | Was zu tun ist |
| --- | --- | --- |
| `push_unauthorized` | Der Push-Dienst hat die Berechtigung abgelehnt (`401`/`403`): der Schlüssel des Servers passt nicht zum angemeldeten Gerät. | Meist wurden die Schlüssel erneuert, **nachdem** sich das Gerät angemeldet hatte — siehe unten. |
| `push_dns_failed` | Der API-Server kann den Host des Push-Dienstes nicht auflösen (`ENOTFOUND`, `EAI_AGAIN`). | DNS des API-Containers prüfen (`dns:` in der `docker-compose.yml` oder Docker-DNS). |
| `push_timeout` | Der Push-Dienst antwortet nicht rechtzeitig (`ETIMEDOUT`): meist verwirft eine Firewall die Pakete. | Ausgehendes HTTPS (Port 443) vom API-Server zum Host des Abos freigeben. |
| `push_unreachable` | Verbindung abgelehnt, abgebrochen oder TLS-Fehler (andere Ursache im Log). | Netzwerkweg und TLS vom API-Container zum Push-Dienst prüfen: `docker compose exec api node -e "fetch('https://fcm.googleapis.com').then(r=>console.log(r.status)).catch(e=>console.log(e.cause?.code))"`. |
| `push_rejected` | Der Push-Dienst hat mit einem anderen Fehler geantwortet (im Log die Statusnummer). | Die Statusnummer im Log mit der Meldung des Push-Dienstes abgleichen. |
| `vapid_key_mismatch` | Der öffentliche Schlüssel gehört nicht zum privaten Schlüssel. | Das Schlüsselpaar neu erzeugen und beide Werte gemeinsam eintragen. |
| `push_subscription_dead` | Alle angemeldeten Geräte sind abgelaufen. | Die Nutzer müssen die Benachrichtigungen im Browser neu erlauben. |
| `no_keys` | Dem Kanal fehlt einer der drei Werte. | `.env` prüfen und den API-Container neu starten. |

### Die Konfiguration des Kanals

Der Kanal liest sein Trio — öffentlicher Schlüssel, privater Schlüssel, Subject — **als Ganzes**: die Zeile `webpush` der Tabelle `notification_channels` gewinnt über die `.env`, aber nur, wenn sie **alle drei** Werte trägt. Eine Zeile mit nur einem Teil davon lässt die Werte der `.env` unverändert gelten. Ein öffentlicher Schlüssel aus der Zeile neben einem privaten Schlüssel aus der `.env` wäre ein Paar, das nicht zusammengehört — der Push-Dienst lehnt dann jede Zustellung mit `403` ab.

Prüfen, was der Server tatsächlich verwendet:

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT enabled, config->>'publicKey' AS public_key, (secret <> '') AS has_private_key
   FROM notification_channels WHERE kind='webpush';"
docker compose exec api printenv VAPID_PUBLIC_KEY
```

Sind beide öffentlichen Schlüssel verschieden, ist die Zeile unvollständig oder veraltet: entweder den fehlenden geheimen Schlüssel in der Zeile nachtragen oder die Zeile löschen.

## Schlüssel erneuert: die Geräte müssen sich neu anmelden

Ein Abo gehört zu dem Schlüsselpaar, mit dem es erzeugt wurde. Wird das Paar erneuert, lehnt der Push-Dienst jede Zustellung für das alte Abo ab (`403`) — und der Browser behält sein Abo, weil `subscribe()` das vorhandene zurückgibt.

Ab StörDesk **v1.1.332** erkennt die Karte „Web Push“ unter `/settings/notifications` das: Sie vergleicht den Schlüssel des Browsers mit dem Schlüssel des Servers, nennt das Gerät („Der Schlüssel des Servers wurde erneuert — dieses Gerät muss neu angemeldet werden.") und meldet es beim Klick auf „Dieses Gerät anmelden“ neu an. Für ältere Stände genügt derselbe Weg von Hand:

1. Unter `/settings/notifications` auf „Dieses Gerät abmelden“ klicken (das entfernt das Abo im Browser **und** die Zeile auf dem Server),
2. danach auf „Dieses Gerät anmelden“ klicken — das Gerät meldet sich mit dem neuen Schlüssel an.

## Was danach passiert

Sobald die drei Werte gesetzt sind und die API neu gestartet ist:

1. verschwindet der Hinweis unter `/notifications`,
2. der öffentliche Schlüssel wird an den Browser ausgeliefert,
3. Nutzer können sich unter `/settings/notifications` für Push-Benachrichtigungen anmelden,
4. Tickets, Eskalationen und Bereitschafts-Erinnerungen können über Web Push versandt werden.
