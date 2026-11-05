format: small-model
status: pending
depends-on: WP-M2-84
phase: 2
context-budget: 10k tokens
spec: PLAN.md §7, PLAN.md §14
spec-lines: 30

files-read:

- apps/web/src/features/tickets/internal-create-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/features/tickets/internal-create-page.tsx

interfaces:

- `internal-create-page.tsx`: removes `systemId` state and the system `<select>`; object option type no longer carries `systems`; submit payload no longer carries `systemId`; error mapping for `system_not_found` removed.

## Task

Remove the system ("Anlage") selection from the internal ticket creation page.

1. `ObjectOption` type drops `systems`.
2. `useObjects` query type updated accordingly (API no longer returns systems).
3. Drop the system `<select>` block and `systemId` state.
4. `handleSubmit` payload no longer includes `systemId`.
5. `errorNotice` no longer maps `systemNotFound`.

## Non-goals

- No i18n changes here (WP-M2-87).
- No changes to fault catalog or contact fields.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/features/tickets/internal-create-page.tsx`
- Follow-up WP: WP-M2-86 (Web objects create/edit/list)
- Open question: none
