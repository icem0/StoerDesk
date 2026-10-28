# Security Policy

## Melden einer Schwachstelle

Bitte **keine** öffentlichen Issues für Sicherheitslücken verwenden.

Meldeweg: E-Mail an die in `SECURITY_CONTACT` des Betreibers hinterlegte Adresse
(vorhanden in `.env` als `SECURITY_CONTACT` bzw. in der Deployment-Konfiguration).

Bitte in der Meldung angeben:

- betroffene Komponente (Web, API, Compose-Setup),
- Beschreibung und Reproduktionsschritte,
- mögliche Auswirkung,
- Hinweis auf bereits bekannte Workarounds.

Wir bestätigen den Eingang, halten den Stand der Behebung nach und melden die
Behebung nach Freigabe.

## Unterstützte Versionen

| Version           | Unterstützt |
| ----------------- | ----------- |
| `main`            | ja          |
| Tags vor `v0.1.0` | nein        |

## Hinweise für den Betrieb

- `SESSION_SECRET` muss in Produktion gesetzt sein (die API verweigert den Start
  mit dem Development-Standardwert).
- `.env` niemals einchecken; `.env.example` ist die Vorlage.
- Keine PII in Logs (Pino, strukturiert).
- Aufkleber und Meldeformular führen den 112-Hinweis — dieser darf nicht entfernt werden.
