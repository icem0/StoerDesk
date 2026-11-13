# WP-M14-34: The prepared view offers an HTML copy for the e-mail

format: small-model
status: done
depends-on: WP-M14-22
phase: 14
milestone: m14
context-budget: 24k tokens
spec: PLAN.md §4, §14 (branded exported ticket views)
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-send-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/features/tickets/ticket-detail-page.tsx

files-write:

- apps/web/src/features/tickets/ticket-send-page.tsx
- apps/web/src/i18n/locales/de/ticket.json, apps/web/src/i18n/locales/en/ticket.json

interfaces:

- the copy button of the prepared send view (HTML clipboard)
- `pdf.copy`, `pdf.copyHint`

## Task

1. The office asked: a `mailto:` body is plain text only — no e-mail client
   ever receives HTML through `mailto:`. The "E-Mail versenden" button of the
   prepared send view is therefore **removed** (the e-mail send will come
   back later as a server-side WP) and replaced by a "Kopieren (HTML)"
   button.
2. The button selects the prepared ticket content (`[data-testid="ticket-send-content"]`)
   and copies it to the clipboard with the browser's HTML flavour:
   `document.execCommand('copy')` over a programmatic selection first,
   `ClipboardItem` (`text/html` + `text/plain`) as the fallback; the
   selection is always cleared. A hint line under the buttons names the
   paste step.
3. The print path (`Als PDF speichern`) stays unchanged; the copy button and
   the hint are `print:hidden`.
4. The now unused `email.*` keys leave `de` and `en`; `pdf.copy` and
   `pdf.copyHint` are added in both.

## Non-goals

- No server-side e-mail send, no recipient input, no API route (that is a
  future WP with its own security audit).
- The header paper-plane button and the ticket detail stay unchanged.

## Acceptance

```bash
npm run typecheck --workspace apps/web
npm run lint
npm run test:run -- apps/web/src/features/tickets
npm run i18n:check
npm run wp:check
```

Expected: green; the prepared view shows "Als PDF speichern" and
"Kopieren (HTML)" on top; the clipboard receives the formatted ticket.

## Handoff

- Files changed: the send view and the two locales
- Interfaces added: `pdf.copy`, `pdf.copyHint`, the copy button
- Verified: targeted web gates + i18n + wp-check (full repo gate red only
  through foreign work in progress in apps/api)
- Follow-up WP: none — the e-mail send returns later as a server-side WP
- Open question: none
