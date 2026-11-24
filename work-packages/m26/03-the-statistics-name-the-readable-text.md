# WP-M26-03: the statistics name the readable text

format: ctx-256k
status: done
depends-on: WP-M26-02
phase: 26
milestone: m26
context-budget: 52k tokens
spec: specs/12-stats.md §12.3; ADR-0049 (decision 2)
spec-lines: 60
changed-lines: 480

files-read:

- specs/12-stats.md §12.3 (the groupings of the frequency)
- apps/api/src/stats/frequency.ts (the four groupings)
- apps/api/src/db/schema.ts (`text_templates`, `text_template_translations`, `detected_errors`)
- apps/api/src/stats/export.ts (the rows of the CSV export)
- packages/shared/src/schemas/stats.ts (the contract of the answer)
- apps/web/src/features/stats/stats-page.tsx (the tables of the groupings)

files-write:

- specs/12-stats.md
- packages/shared/src/schemas/stats.ts
- apps/api/src/stats/frequency.ts
- apps/api/src/stats/export.ts
- apps/web/src/features/stats/stats-page.tsx
- apps/web/src/i18n/locales/de/stats.json, apps/web/src/i18n/locales/en/stats.json

interfaces:

- `GET /api/v1/stats/frequency` — the groupings carry `labelDe` and `labelEn`
- `queryFrequency(database, filter, now?): Promise<Frequency>`

## Task

The four groupings of the frequency answered the machine key and the column
heading called it „Schlüssel" (ADR-0049 decision 2).

1. **The spec** `specs/12-stats.md` §12.3 names the labels of the groupings:
   the fault templates and the detected errors carry `labelDe` and `labelEn`
   beside the key; the system type keeps the key alone, because
   `objects.external_type` is a free text.
2. **The contract** `packages/shared/src/schemas/stats.ts`: the row of a
   grouping carries `key`, `labelDe`, `labelEn` and `count`.
3. **The service** `apps/api/src/stats/frequency.ts` joins the translations of
   the fault templates and the labels of the detected errors; a key without an
   entry in the catalog answers an empty label, so an archived template stays
   resolvable and an unknown key stays visible.
4. **The export** `apps/api/src/stats/export.ts` writes the labels as their own
   metric rows (`labelDe`, `labelEn`) beside the row of the count.
5. **The page** `apps/web/src/features/stats/stats-page.tsx` shows the readable
   text: the text of the answer for the fault templates and the detected
   errors, the translated system type from a fixed map (the raw value for an
   unknown type), the key is not shown a second time. The heading of the column
   is „Art" and not „Schlüssel"; the texts of the metrics explain the median,
   the average and the p90.
6. **The tests**: the integration test of the frequency and a new test of the
   page prove that the page shows the name and not the key.

## Non-goals

- No change of the aggregate itself — the counts stay the same.
- No diagram — **WP-M26-04** and **WP-M26-05**.
- No translation of a key that no catalog knows: the raw value stays visible.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test of the page fails before the change and
passes after it.

## Handoff

- Files changed: the spec, the contract, the service, the export, the page and
  the two locales
- Interfaces added: the fields `labelDe` and `labelEn` of a grouping
- Verified: the commands above — the check run of the version v1.2.132 failed in
  the typecheck of the web (the incremental cache of the container hid the
  error); the fix came with **WP-M26-04**, the run of v1.2.133 is green
- Follow-up WP: none
- Open question: none
