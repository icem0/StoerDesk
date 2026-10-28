# Work Packages

Ein Work Package (WP) ist die kleinste abgeschlossene Umsetzungseinheit.
Ein WP = ein Modell-Durchlauf = ein Commit. Konventionen siehe `specs/15-work-packages.md`.

Namensschema: `work-packages/<meilenstein>/<nr>-<slug>.md`
Abhängigkeiten: Header `depends-on: WP-XX-YY, ...`

## Meilensteine

| Meilenstein | Inhalt                                                                  | WPs |
| ----------- | ----------------------------------------------------------------------- | --- |
| [m1](m1/)   | Fundament (Monorepo, Compose, DB, i18n, RBAC, Auth, Admin-UI, CI)       | 12  |
| [m2](m2/)   | Meldung online (Objekte, QR, Meldeformular, Statusseite, Spam, Offline) | 10  |

## Status

> **Current state:** implemented are **WP-M1-01**, **WP-M1-02**, **WP-M1-03** and
> **WP-M1-04** (foundation, Compose, Drizzle base tables, i18n skeleton). The remaining
> WPs are unchanged working plans and are only implemented after approval — WP by WP,
> never in bulk. A WP counts as done only when code, tests, lint, typecheck and docs
> agree and the corresponding commit is pushed.
