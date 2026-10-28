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

> **Aktueller Stand:** Umgesetzt sind **WP-M1-01**, **WP-M1-02** und **WP-M1-03**
> (Fundament, Compose, Drizzle-Grundtabellen). Die übrigen WP sind unveränderte
> Arbeitsplanung und werden erst nach Freigabe umgesetzt — WP für WP, nicht gesammelt.
> Ein WP gilt erst als erledigt, wenn Code, Tests, Lint, Typecheck und Doku stimmen
> und der dazugehörige Commit gepusht ist.
