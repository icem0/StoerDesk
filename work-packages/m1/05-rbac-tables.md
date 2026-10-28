# WP-M1-05: RBAC-Tabellen + Seeds

depends-on: WP-M1-03
milestone: m1

## Ziel

Migration 0002: roles, permissions, role_permissions, user_roles, user_permissions, object_groups.
Seeds: 5 Default-Rollen, Permission-Katalog aus `packages/shared/permissions.ts`.

## Spec-Referenzen

- specs/01-rbac.md §3.2, §3.3, §3.4
- specs/02-data-model.md §4.1

## Aufgabe

1. `packages/shared/src/permissions.ts` mit `PERMISSIONS`-Konstante (alle Keys aus specs/01 §3.4) und `DEFAULT_ROLES` (5 Rollen mit Permissions)
2. `apps/api/src/db/schema.ts` erweitern um die 6 Tabellen
3. Migration generieren
4. Seed-Skript `apps/api/src/db/seed-rbac.ts`: liest `DEFAULT_ROLES`, upsertet roles/permissions/role_permissions
5. Test: nach Seed existieren 5 Rollen, `admin` hat `is_system=true`, Permission-Anzahl stimmt mit Konstante überein

## Akzeptanz

- Migration läuft
- Seed ist idempotent (2× ausführen ändert nichts)
- `admin` ist nicht löschbar (DB-Constraint oder Service-Guard vorbereitet)
