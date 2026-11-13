# WP-M14-41: Time-based conditions for escalation rules

format: small-model
status: planned
depends-on: WP-M14-40
phase: 14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.4
spec-lines: 40

files-read:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/__tests__/escalation.test.ts
- apps/api/src/tickets/escalation.ts

files-write:

- packages/shared/src/schemas/escalation-config.ts
- packages/shared/src/escalation.ts
- packages/shared/src/__tests__/escalation.test.ts

interfaces:

- Bedingungs-Leaf `time_of_day` mit Operatoren `in` / `notIn` und Werten wie `"00:00-06:00"`, `"06:00-22:00"`, `"22:00-00:00"`
- `evaluateEscalationCondition(condition, facts)` ergänzt um `time_of_day`-Auswertung gegen die aktuelle Uhrzeit

## Task

1. `packages/shared/src/schemas/escalation-config.ts`: `escalationConditionLeafSchema` bekommt einen neuen Leaf `time_of_day` mit `z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/)`; Wert kann einzelner String oder Array sein (für `in`/`notIn`).
2. `packages/shared/src/escalation.ts`: `evaluateEscalationCondition` wertet `time_of_day` aus — die aktuelle Uhrzeit (UTC oder konfigurierte Zeitzone `Europe/Berlin`) muss in einem der angegebenen Intervalle liegen; Über Mitternacht hinweg (z. B. `22:00-06:00`) wird korrekt gehandhabt.
3. `packages/shared/src/__tests__/escalation.test.ts`: Tests für `time_of_day` — Match innerhalb/außerhalb des Intervalls, Mitternachts-Übergang, Array-Werte, ungültige Zeitangaben.

## Non-goals

- Keine UI für Zeitbedingungen in der Regel-Editierung (der Condition-Builder müsste später erweitert werden; die JSON-Konfiguration funktioniert bereits).
- Keine automatische Tag/Nacht-Umschaltung von Stati (nur Bedingung für Eskalations-Regeln).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: alle grün; `time_of_day: { in: ["22:00-06:00"] }` matcht zur Nachtzeit und nicht am Tag; `time_of_day: { notIn: ["06:00-22:00"] }` matcht umgekehrt; Über-Mitternacht-Intervalle funktionieren.

## Handoff

- Files changed: `escalation-config.ts`, `escalation.ts`, `escalation.test.ts`
- Interfaces added: `time_of_day`-Bedingungs-Leaf
- Verified: `npm run check` grün
- Follow-up WP: Kein direktes Follow-up; die Kombination WP-M14-35 … WP-M14-41 ermöglicht dynamische Workflows (konfigurierbare Stati, konfigurierbare Transitionen, status_change als Eskalations-Aktion, zeitabhängige Bedingungen).
- Open question (if any): ob die Zeit in der Zeitzone des Tickets oder der Server-Zeitzone ausgewertet wird.
