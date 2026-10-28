# Glossar

> Platzhalter gemäß `work-packages/m1/10-ci-workflow.md` (WP-M1-10).
> Begriffe werden mit der Spezifikation (`specs/`) abgeglichen.

| Begriff              | Bedeutung                                                                            |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Objekt**           | Ein gemeldeter Standort/Einheit mit QR-Code (siehe `specs/08-objects-api.md`)        |
| **Anlage / System**  | Die konkrete technische Anlage eines Objekts (`systems`)                             |
| **Ticket**           | Ein Störungsfall mit Status- und Timeline-Historie (`specs/03-ticket-workflow.md`)   |
| **Timeline / Event** | Unveränderlicher Eintrag der Ticket-Historie (`specs/05-timeline.md`)                |
| **On-Call**          | Rufbereitschaftsplanung mit Slots und Tausch (`specs/04-oncall.md`)                  |
| **Permission**       | Fein granulare Berechtigung, Quelle der Wahrheit in `packages/shared/permissions.ts` |
| **Rolle**            | Bündel von Permissions (5 Default-Rollen, siehe `specs/01-rbac.md`)                  |
| **Outbox**           | Pufferschlange für Benachrichtigungen bzw. Offline-Synchronisation                   |
| **112**              | Europäische Notrufnummer — Hinweis auf Meldeformular und Aufklebern                  |
