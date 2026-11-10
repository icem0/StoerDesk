# WP-M11-11: ticket detail labels the fault field as the reported fault type

format: small-model
status: done
depends-on: WP-M11-10
phase: 11
milestone: m11
context-budget: 10k tokens
spec: PLAN.md §14; PLAN.md §3.1
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx (the fault field of the detail view)
- apps/web/src/features/tickets/ticket-email-page.tsx (shares the same i18n key)
- apps/web/src/i18n/locales/de/ticket.json (the `detail.field.*` keys)

files-write:

- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

interfaces:

- i18n key `ticket:detail.field.faults` (`de`, `en`)

## Task

The office asked for a more precise field name in the ticket view: the fault chips
below title and description are the fault types this report was made for, not a list
of all known fault types.

1. In `apps/web/src/i18n/locales/de/ticket.json` change the value of
   `detail.field.faults` from `Störungsarten` to `Gemeldete Störungsart`.
2. In `apps/web/src/i18n/locales/en/ticket.json` change the value of the same key
   from `Fault types` to `Reported fault type` (`de` is the reference locale, `en`
   stays in parity).
3. Touch the key value only: no page, no route, no test-name and no other label
   changes.

## Non-goals

- No rename of `report.faults.label` (report form), `internal.create.fields.faults`
  (internal creation form) or the `settings.textTemplates` catalog title.
- No new i18n key and no split of the shared `detail.field.faults` key — the ticket
  e-mail export keeps showing the same label as the detail view.
- No data-model, API or statistics change; the field stays a list of fault-template
  keys.

## Acceptance

```bash
npm run i18n:check
npm run test:run -- apps/web/src/features/tickets
npm run wp:check
```

Expected: the de/en key parity and the referenced-key check stay green, the ticket
suite stays green and `wp:check` reports this package without new findings.

## Handoff

- Files changed: `de/ticket.json` and `en/ticket.json` (one value each)
- Interfaces added: none (key value change only)
- Verified: ticket suite green, i18n parity green for the changed key
- Follow-up WP: none
- Open question: none
