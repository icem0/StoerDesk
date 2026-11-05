format: small-model
status: pending
depends-on: WP-M2-83
phase: 2
context-budget: 10k tokens
spec: PLAN.md §10, PLAN.md §14
spec-lines: 30

files-read:

- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/features/tickets/report-form-page.tsx

interfaces:

- `report-form-page.tsx`: removes `SystemSelect` component usage and definition; removes `systemChoice`/`systemId` state; removes `systemId` from the submit body; `useOpenTickets` no longer takes a `systemId`; `ObjectHeader` no longer renders `noSystems` hint.

## Task

Remove the system ("Anlage") selection from the public report form at `/m/:token`.

1. Drop `SystemSelect` component and its render call in the form.
2. Remove `systemChoice` state and `defaultSystemId`; `selectedSystemId` is no longer needed.
3. `sendReport` body no longer carries `systemId`.
4. `useOpenTickets(qrToken)` — no system parameter; the duplicate hint lists all open tickets of the object.
5. `ObjectHeader` no longer shows "no systems" hint.

## Non-goals

- No i18n changes here (WP-M2-87).
- No changes to photo upload or fault chips.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/features/tickets/report-form-page.tsx`
- Follow-up WP: WP-M2-85 (Web internal create)
- Open question: none
