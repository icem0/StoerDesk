# WP-M4-07: Ticket detail UI redesign — timeline on top, actions in a dropdown

format: small-model
status: done
depends-on: WP-M2-18b, WP-M2-19d, WP-M6-11
phase: 4
context-budget: 25k tokens
spec: PLAN.md §7, §9, §14
spec-lines: 40

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/features/tickets/ticket-timeline.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- packages/shared/src/schemas/ticket.ts

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — full visual rework per user request
- apps/web/src/features/tickets/ticket-timeline.tsx — add 6 h scale markings under the bar
- apps/web/src/i18n/locales/de/ticket.json — new keys: detail.field.recordedBy, detail.field.reportedBy, detail.field.source, detail.action.list, timeline.scale.*, detail.statusAndPriority
- apps/web/src/i18n/locales/en/ticket.json — same keys in English

interfaces:

- no API change; the existing `TicketDetailResponse` fields (`objectNo`, `objectName`, `status`, `priority`, `source`, `reporterName`, `reporterPhone`, `reporterEmail`, `reportedAt`, `deadlineAt`, `timeline`, `events`, `photos`, `description`) are reused.
- `source` is shown as "Quelle" (Erfassungskanal, z. B. System/Öffentlich/Intern).
- "Erfasser" maps to `reporterName` (the app user who created the ticket), "Meldender" maps to the contact name from `reporterPhone`/`reporterEmail`, "Quelle" maps to `source`.

## Task

1. **Header area**: remove the "Zurück zur Liste" button. Move status + priority to the top right with coloured indicators (badge + optional symbol). Keep ticket number + object as title.
2. **Timeline on top**: full-width timeline bar directly under the header. Left: "Gemeldet am {reportedAt}". Right: "Reaktionszeit bis {deadlineAt} (72 Std)". Under the bar: a scale with markings every 6 h (0 h, 6 h, 12 h, 18 h, … up to the deadline). Milestone markers (report, review, work order, accept, acknowledge) stay as dots on the bar.
3. **Object row**: "Bezeichner" (Objekt) label above, then object name and object number side by side.
4. **Three fields side by side**: labels above, then values: Erfasser (app user), Meldender (contact), Quelle (source).
5. **Description**: a labelled text field below the three fields.
6. **Photos**: photo gallery below the description.
7. **History / Verlauf**: the append-only event list below the photos.
8. **Actions**: all workflow actions (review, work order, assign, offer, accept, decline, acknowledge, close, reopen, cancel, comment, delete) move into a single `<select>` dropdown menu. Choosing an entry shows its confirmation fields inline ("Bestätigen"/"Abbrechen"). No permanently visible action buttons or input fields.
9. The menu also carries "Zurück zur Liste" as an entry so the removed back button is replaced.

## Non-goals

- No API, schema, migration or permission change.
- No timeline computation change; only the visual scale is added.
- No status page change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green. The detail page shows timeline on top, status/priority top right, object+number side by side, Erfasser/Meldender/Quelle side by side, then description, photos, history; all actions behind one dropdown.

## Handoff

- Files changed: `ticket-detail-page.tsx`, `ticket-timeline.tsx`, both `ticket.json` locales
- Interfaces added: none (UI rework only)
- Verified: `npm run check` green (typecheck, eslint, vitest 483 tests, i18n:check 635/635 keys, wp:check 220/220)
- Corrected by: the repair of the red CI runs v1.0.25 … v1.0.29 — WP-M4-07 moved all
  workflow actions into one dropdown but left body-less actions (review, assign,
  accept, close) and "Zurück zur Liste" without a working target, so the phase-4 and
  phase-5 E2E exit criteria were red against a real database and Chromium (e2e skips
  locally without those and is never a green proof). The dropdown now performs
  body-less actions on confirmation and navigates back to the list; the E2E specs
  drive the dropdown instead of the removed buttons, and confirm inputs are
  addressable via `name` attributes.
- Follow-up WP: none
- Open question: none
