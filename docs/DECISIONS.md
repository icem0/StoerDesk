# Architecture Decision Records (ADR)

Format: eine Datei pro Entscheidung in `docs/DECISIONS/`, Nummerierung fortlaufend.

## Vorlage

```markdown
# ADR-NNNN: Titel

- Status: proposed | accepted | superseded by ADR-XXXX
- Datum: JJJJ-MM-TT
- Beteiligte: <Rollen>

## Kontext

<Ausgangslage, Randbedingungen>

## Entscheidung

<Was wird entschieden>

## Alternativen

<Welche Alternativen wurden verworfen und warum>

## Konsequenzen

<Positiv/Negativ, Follow-up>
```

## Index

| ADR                                                           | Titel                                 | Status   |
| ------------------------------------------------------------- | ------------------------------------- | -------- |
| [ADR-0001](DECISIONS/0001-monorepo-with-npm-workspaces.md)    | Monorepo mit npm-Workspaces           | accepted |
| [ADR-0002](DECISIONS/0002-uuid-v7-as-database-primary-key.md) | UUID v7 als Primärschlüssel in der DB | accepted |
