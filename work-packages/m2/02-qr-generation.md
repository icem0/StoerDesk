# WP-M2-02: QR-Erzeugung + Regeneration

depends-on: WP-M2-01
milestone: m2

## Ziel

Beim Anlegen eines Objekts wird `qr_token` generiert (22 Zeichen URL-sicher). Regeneration mit 30-Tage-Redirect.

## Spec-Referenzen

- specs/08-objects-api.md §QR-Regeln
- specs/02-data-model.md §objects (qr_token)

## Aufgabe

1. Token-Generator (crypto.randomBytes, base64url, 22 Zeichen)
2. POST /api/v1/objects/:id/regenerate-qr (Permission object.regenerate_qr), schreibt in `old_qr_tokens`-Tabelle (neue Migration) mit `expires_at = now + 30 days`
3. Auflösung `/m/:token` prüft erst objects.qr_token, dann old_qr_tokens (Redirect)
4. pg-boss-Job täglich: löscht abgelaufene old_qr_tokens
5. Tests: Token einzigartig, Regeneration, alter Token funktioniert 30 Tage, Cleanup-Job

## Akzeptanz

- 4 Tests grün
