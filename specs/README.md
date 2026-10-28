# StörDesk — Spezifikation

Diese Dateien bilden die fachliche und technische Spezifikation von **StörDesk** ab.
Sie sind die verbindliche Grundlage für die spätere Umsetzung (Umsetzung folgt erst
nach Freigabe — aktuell gilt: **es wird nichts implementiert**).

## Dateiübersicht

| Datei                                          | Inhalt                   | Umfang      |
| ---------------------------------------------- | ------------------------ | ----------- |
| [00-conventions.md](00-conventions.md)         | Kap. 0 + 2 + 2a          | ~120 Zeilen |
| [01-rbac.md](01-rbac.md)                       | Kap. 3 + 4.1             | ~200 Zeilen |
| [02-data-model.md](02-data-model.md)           | Kap. 4 komplett          | ~250 Zeilen |
| [03-ticket-workflow.md](03-ticket-workflow.md) | Kap. 5 + 5.x-Ergänzungen | ~200 Zeilen |
| [04-oncall.md](04-oncall.md)                   | Kap. 5a                  | ~280 Zeilen |
| [05-timeline.md](05-timeline.md)               | Kap. 6                   | ~80 Zeilen  |
| [06-report-form.md](06-report-form.md)         | Kap. 7                   | ~100 Zeilen |
| [07-escalation.md](07-escalation.md)           | Kap. 8                   | ~80 Zeilen  |
| [08-objects-api.md](08-objects-api.md)         | Kap. 9                   | ~180 Zeilen |
| [09-offline.md](09-offline.md)                 | Kap. 10                  | ~180 Zeilen |
| [10-notifications.md](10-notifications.md)     | Kap. 11                  | ~150 Zeilen |
| [11-dashboard.md](11-dashboard.md)             | Kap. 12                  | ~60 Zeilen  |
| [12-stats.md](12-stats.md)                     | Kap. 13                  | ~80 Zeilen  |
| [13-ui.md](13-ui.md)                           | Kap. 14                  | ~60 Zeilen  |
| [14-nfr.md](14-nfr.md)                         | Kap. 15                  | ~120 Zeilen |
| [15-work-packages.md](15-work-packages.md)     | Kap. 17 + 17a            | ~200 Zeilen |
| [16-acceptance.md](16-acceptance.md)           | Kap. 18 + 19             | ~180 Zeilen |

## Regeln

- Jede Datei deckt genau die oben genannten Kapitel ab, keine darüber hinaus.
- Fehlt der Kapitel-Inhalt, bleibt die Datei als Platzhalter bestehen — es wird nichts
  erfunden und nichts vorzeitig umgesetzt.
- Änderungen an der Spezifikation werden als eigener Commit mit Typ `docs(spec)` abgelegt.
- Die Kapitelnummerierung bleibt stabil; neue Kapitel werden als `x` angehängt
  (z. B. Kap. 5.x), damit bestehende Verweise gültig bleiben.

## Abgrenzung

- `specs/` = **Was** gebaut werden soll (Fachlogik, Datenmodell, Anforderungen).
- `AGENTS.md` = **Wie** im Repository gearbeitet wird (Konventionen, Qualität, Workflow).
- `docs/` = Material, das zur Spezifikation geliefert wird (Ursprungsmaterial, Notizen).
