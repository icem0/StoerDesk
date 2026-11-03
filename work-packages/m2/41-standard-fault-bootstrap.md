# WP-M2-41: bootstrap standard fault types

format: small-model
status: done
depends-on: WP-M2-00
phase: 2
context-budget: 8k tokens
spec: specs/02-data-model.md §4.5 (bootstrap table), specs/06-report-form.md §7.2
spec-lines: 30

files-read:

- specs/02-data-model.md §4.5
- packages/shared/src/seed/standard-texts.ts — `STANDARD_TEXTS`, `STANDARD_TEXT_KEYS`
- apps/api/src/db/seed-demo.ts — the localized seed loop
- apps/api/src/db/__tests__/seedDemo.integration.spec.ts — the seed counts
- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx — chip labels

files-write:

- packages/shared/src/seed/standard-texts.ts
- apps/api/src/db/__tests__/seedDemo.integration.spec.ts
- apps/web/src/features/tickets/__tests__/report-form-page.test.tsx

interfaces:

- `STANDARD_TEXT_KEYS` — the eight bootstrap keys: `bma.line_interruption`,
  `bma.fault_unknown`, `bma.signal_device_fault`, `bma.detector_fault`,
  `bma.false_alarm`, `bma.power_supply_fault`, `bma.input_fault`,
  `bma.battery_fault`
- `STANDARD_TEXTS` — the German/English pair of every key, German text exactly
  as specified (Leitungsunterbrechung, Störung (Unbekannt), Störung Signalgeber,
  Störung Melder, Täuschungsalarm, Störung Energieversorgung, Störung Eingang,
  Störung Akku)

## Task

1. Replace the placeholder nine texts with the eight requested standard fault
   types in `STANDARD_TEXTS` and `STANDARD_TEXT_KEYS`. Keys stay stable machine
   keys, the German text is the reference and English carries the same meaning.
2. Update the demo-seed integration test to 8 templates and 16 translation rows.
3. Update the report-form unit test to the new chip labels and machine keys.

## Non-goals

- No admin API, no archive column and no database migration (WP-M2-40).
- No E2E label change (WP-M2-41b).
- The seed still never overwrites an edited translation.

## Acceptance

```bash
npx vitest run apps/api/src/db/__tests__/seedDemo.integration.spec.ts \
  apps/web/src/features/tickets/__tests__/report-form-page.test.tsx
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

Expected: all green; the integration test really runs against the database.

## Handoff

- Files changed: the shared seed resource and the two affected tests
- Interfaces added: the eight bootstrap keys above
- Verified: `npx vitest run` (seed demo + report form, 17 tests green), `npm run typecheck`
- Follow-up WP: WP-M2-41b (E2E labels)
- Open question: none
