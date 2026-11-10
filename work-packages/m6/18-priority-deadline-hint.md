# WP-M6-18: priority select shows the configured deadline

format: small-model
status: done
depends-on: WP-M6-17
phase: 6
milestone: m6
context-budget: 14k tokens
spec: specs/05-timeline.md §5.1; PLAN.md §3.1
spec-lines: 20

files-read:

- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/api/src/settings/deadlines.ts

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- every priority option reads `Name (Nh)` with the effective deadline hours from
  `GET /api/v1/settings/deadline-hours`, e.g. `Normal (72h)`.
- while the answer is missing the option keeps the plain priority name.

## Task

1. Add a `useDeadlineHours` query on `/v1/settings/deadline-hours` to the create
   form.
2. Render each option as `t('internal.create.priorityOption', { priority, hours })`
   when the hours are known, otherwise the plain `internal.create.priority.*` text.
3. Add `internal.create.priorityOption` = `{{priority}} ({{hours}}h)` in `de` and
   `en`.
4. Extend the page test: the stub answers configured hours and the options show
   `Niedrig (168h)`, `Normal (72h)`, `Hoch (24h)`, `Kritisch (8h)`.

## Non-goals

- No change to the report form (it stays `normal`).
- No change to the payload or server validation.
- No new route (WP-M6-17).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `de` and `en` stay symmetric.

## Handoff

- Files changed: the internal create form, its page test and the two locale files
- Interfaces added: `internal.create.priorityOption`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors, 7 pre-existing warnings), `npx vitest run apps/web/src/features/tickets/__tests__/internal-create-page.test.tsx` (11 passed), `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
