# Glossary

> Placeholder from `work-packages/m1/10-ci-workflow.md` (WP-M1-10), translated into
> English by WP-M1-10c. Terms are matched against the slices in `specs/`. The UI label
> is given in parentheses when the German product text uses a different word.

| Term                              | Meaning                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Object** (UI: Objekt)           | A reported location or unit with a QR code (see `specs/08-objects-api.md`)                                               |
| **System** (UI: Anlage)           | The concrete technical system of an object (table `systems`)                                                             |
| **Ticket**                        | A malfunction case with status and timeline history (`specs/03-ticket-workflow.md`)                                      |
| **Timeline event**                | Immutable entry of the ticket history (`specs/05-timeline.md`)                                                           |
| **On-call** (UI: Rufbereitschaft) | Duty roster with slots and swaps (`specs/04-oncall.md`)                                                                  |
| **Permission**                    | Fine-grained right, source of truth in `packages/shared/src/permissions.ts`                                              |
| **Role** (UI: Rolle)              | Bundle of permissions (5 default roles, see `specs/01-rbac.md`)                                                          |
| **Outbox**                        | Buffer queue for notifications and for offline synchronisation                                                           |
| **Reporter** (UI: Melder)         | Person who submits a malfunction report; anonymous reporting is a public capability                                      |
| **112**                           | European emergency number — notice on the report form and the printed stickers; StörDesk is never an emergency call path |
