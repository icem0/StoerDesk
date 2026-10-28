# WP-M2-08: Dubletten-Hinweis

depends-on: WP-M2-05
milestone: m2

## Ziel

Vor dem Absenden prüft das Formular, ob für Objekt+Anlage ein offenes Ticket existiert. Zeigt Hinweis mit „Trotzdem neu" / „Ergänzen".

## Spec-Referenzen

- specs/06-report-form.md §Dubletten-Hinweis

## Aufgabe

1. GET /api/v1/public/tickets/open?object_id=&system_id=
2. UI-Hinweis im Formular
3. „Ergänzen" hängt Text an bestehendes Ticket als Kommentar-Event
4. Tests: Hinweis erscheint, „Trotzdem neu" legt neues Ticket an, „Ergänzen" erzeugt Kommentar

## Akzeptanz

- 3 Tests grün
