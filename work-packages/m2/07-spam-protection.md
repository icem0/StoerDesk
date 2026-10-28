# WP-M2-07: Spamschutz

depends-on: WP-M2-04
milestone: m2

## Ziel

Honeypot, Altcha-Captcha bei Auffälligkeit. Definition Auffälligkeit in specs/06: >3 Meldungen/10 min pro IP oder qr_token.

## Spec-Referenzen

- specs/06-report-form.md §Spamschutz

## Aufgabe

1. Honeypot-Feld im Formular (hidden, name="website")
2. Altcha-Widget im Frontend (nur bei Auffälligkeit einblenden)
3. Server: Altcha-Payload verifizieren (Bibliothek `altcha-lib`)
4. Flag `suspected_spam` auf Ticket setzen, aber Ticket anlegen (nicht verwerfen)
5. Tests: Honeypot gefüllt → Ticket mit Flag, Altcha fehlt bei Auffälligkeit → 400, Altcha ok → Ticket ohne Flag

## Akzeptanz

- 3 Tests grün
- Kein Ticket geht verloren (auch bei Verdacht)
