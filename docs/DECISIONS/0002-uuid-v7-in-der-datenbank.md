# ADR-0002: UUID v7 als Primärschlüssel in der Datenbank

- Status: accepted
- Datum: 2026-10-28
- Beteiligte: Projektverantwortung, API-Entwicklung

## Kontext

StörDesk verwendet UUIDs als Primärschlüssel (AGENTS.md, Konventionen). Laufende Nummern
sind ausgeschlossen. Die Datenbank ist Postgres 16 und stellt dort keine eingebaute
`uuidv7()`-Funktion bereit (erst Postgres 18). Gewünscht ist laut Konvention „UUID v7 als
Default in der DB“, also eine serverseitige Default-Generierung statt App-seitlicher IDs.

## Entscheidung

Migration `0000_base_tables` erzeugt die SQL-Funktion `gen_uuid_v7()` (48 Bit Zeitstempel
in Millisekunden, Versionsnummer 7, RFC-9562-Variant-Bits, Rest Zufall). Alle UUID-
Primärschlüssel der Basistabellen erhalten `DEFAULT gen_uuid_v7()`. Die Funktion ist
`CREATE OR REPLACE` und `VOLATILE` ausgeführt, damit sie auch bei erneutem Anlaufen der
Migration stabil bleibt.

## Alternativen

- **`gen_random_uuid()` (UUID v4)**: keine zeitliche Sortierbarkeit, Index-Bloat durch
  zufällige Einfügepunkte.
- **App-seitliche Generierung (z. B. `uuidv7`-npm-Paket)**: teilt die Regel zwischen API und
  Seed/Skripten auf; direkte SQL-Zugriffe (Seeds, Auswertungen, Reparaturen) würden sie
  umgehen.
- **Extension (z. B. `pg_uuidv7`)**: zusätzlicher Installations-Schritt auf dem Host,
  nicht überall verfügbar (managed Anbieter).
- **Postgres 18**: Version ist für den Betrieb nicht freigegeben.

## Konsequenzen

- IDs sind grob zeitlich sortiert; Indizes bleiben lokalitätsfreundlich, und neue Zeilen
  lassen sich über den ID-Bereich grob einordnen.
- Innerhalb derselben Millisekunde ist die Reihenfolge nicht garantiert — für die
  Ticket-Timeline sind die Event-Zeitstempel und Event-Sequenzen maßgeblich, nicht die IDs.
- Die Funktion liegt in der ersten Migration. Spätere Migrationen dürfen sie nicht
  zurücknehmen; Änderungen erfolgen als zusätzliche Migration.
- Tests prüfen die Versions- und Variant-Bits sowie die zeitliche Einordnung der IDs.
