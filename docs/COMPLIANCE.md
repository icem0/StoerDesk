# Compliance

> Platzhalter gemäß `work-packages/m1/10-ci-workflow.md` (WP-M1-10).

## DSGVO / Datenschutz

- Personenbezogene Daten (Kontaktdaten von Meldern, Fotos) werden zweckgebunden verarbeitet.
- Es werden keine PII im Klartext geloggt (siehe `docs/REPO-MAP.md` → Konventionen).
- Betroffene Auskunfts- und Löschanfragen sind über den in `SECURITY.md` genannten Weg zu stellen.

## Aufbewahrung

| Daten                | Aufbewahrung                    | Verantwortlich |
| -------------------- | ------------------------------- | -------------- |
| Tickets und Timeline | gemäß `specs/14-nfr.md`         | Betrieb        |
| Fotos von Meldungen  | gemäß `specs/14-nfr.md`         | Betrieb        |
| Sessions             | gemäß `specs/00-conventions.md` | Betrieb        |
| Logs                 | gemäß `specs/14-nfr.md`         | Betrieb        |

## Einwilligung

Die Einwilligung für die Verarbeitung von Fotos und Kontaktdaten wird im Meldeformular
(`specs/06-report-form.md`) eingeholt.

## Offene Punkte

- Aufbewahrungsfristen finalisieren (Abhängigkeit zu `specs/14-nfr.md`).
- Verantwortlicher im Impressum ergänzen.
