# WP-M9-13: statistics CSV export

format: small-model
status: done
depends-on: WP-M9-12
phase: 9
milestone: m9
context-budget: 14k tokens
spec: specs/12-stats.md §12.9
spec-lines: 40

files-read:

- specs/12-stats.md (§12.9 CSV export)
- apps/api/src/stats/routes.ts (filter parsing and guards)
- apps/api/src/stats/reaction-times.ts, frequency.ts, objects.ts, compliance.ts (section results)
- packages/shared/src/schemas/stats.ts (filter contract)
- apps/api/src/tickets/list.ts (reply and query style)
- apps/api/src/tickets/__tests__/list.routes.integration.spec.ts (route test setup)

files-write:

- apps/api/src/stats/export.ts
- apps/api/src/stats/routes.ts
- apps/api/src/stats/__tests__/statsExport.integration.spec.ts

interfaces:

- `toStatisticsCsv(sections)` — semicolon-separated UTF-8 rows with header `section;metric;bucket;key;value`
- `GET /api/v1/stats/export.csv` guarded by `stats.export`
- `content-disposition: attachment; filename="stoerdesk-statistik-<from>-<to>.csv"`

## Task

1. Add `apps/api/src/stats/export.ts`: serialize the five result sections of
   §12.2–§12.5 into rows `section;metric;bucket;key;value`, quoting a field only
   when it contains `;`, `"` or a newline, and writing a UTF-8 body with a
   trailing newline.
2. Add `GET /api/v1/stats/export.csv` to `apps/api/src/stats/routes.ts` with the
   shared filter, `stats.export` and the attachment header. Reuse the range
   validation of WP-M9-12; a range over 366 days stays `422 stats_range_invalid`.
3. Stream the rows through the reply; never build the full CSV as one string
   and never load ticket rows into the process.
4. Add a route test: a `manager` downloads a file with the fixed header and the
   expected sections, a user without `stats.export` gets `403`, the filename
   carries the range, and a semicolon in an object name is quoted.

## Non-goals

- No PDF and no scheduled e-mail report.
- No additional statistics beyond the five sections.
- No locale-specific header translation; the header stays machine-readable.
- No UI button (WP-M9-15).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the export test runs against a throwaway database and skips
with a named reason otherwise.

## Handoff

- Files changed: the CSV serializer, the statistics route plugin, the export test
- Interfaces added: `GET /api/v1/stats/export.csv`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: WP-M9-15 (download button on the statistics page)
- Open question: none
