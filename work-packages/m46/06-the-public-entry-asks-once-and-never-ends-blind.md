# WP-M46-06: the public entry asks once and never ends blind

format: ctx-256k
status: planned
depends-on: WP-M46-03
phase: 46
milestone: m46
context-budget: 45k tokens
spec: specs/06-report-form.md §7.8.1, §7.10; specs/19-customer-portal.md §19.5
spec-lines: 90
changed-lines: 380

files-read:

- PLAN.md §2, §3, §17, §18
- specs/06-report-form.md §7.8.1, §7.10
- specs/19-customer-portal.md §19.5
- apps/web/src/features/tickets/qr-landing-page.tsx
- apps/web/src/features/tickets/report-form-page.tsx (the duplicate hint)
- apps/web/src/features/customer/portal-tickets-page.tsx
- apps/web/src/i18n/locales/de/ticket.json, en/ticket.json, de/customer.json, en/customer.json

files-write:

- apps/web/src/features/tickets/qr-landing-page.tsx
- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/features/customer/portal-tickets-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/i18n/locales/de/customer.json
- apps/web/src/i18n/locales/en/customer.json
- apps/web/src/features/tickets/**tests**/qr-landing-page.test.tsx
- apps/web/src/features/tickets/**tests**/report-form-page.test.tsx
- apps/web/src/features/customer/**tests**/portal-tickets-page.test.tsx

interfaces:

- „Trotzdem eine neue Meldung melden“ on `/m/:token` opens
  `/m/:token/neu?neu=1`; the form shows no second duplicate box for that
  visit
- an unknown QR token shows a page titled „QR-Code ungültig“ with the
  advice to scan the sticker again — no button into the same dead end
- the switched-off customer portal shows its notice alone

## Task

The review walked the public path on a phone. After a QR scan the landing
page says „Zu diesem Objekt ist bereits eine Meldung offen“ and offers
„Trotzdem eine neue Meldung melden“; the form it opens repeats the same box
with „Ergänzen“ and „Trotzdem neu melden“ — the reporter decides the same
question twice. An unknown token shows the heading „Offene Meldung“ with
„Dieser QR-Code ist ungültig“ and a button „Störung melden“ that leads to the
same invalid token. The switched-off portal shows „Das Kundenportal ist in
dieser Installation abgeschaltet“ in the error red and below it „Sie haben
zurzeit keine offene Meldung“ and the empty heading „Meine Anlagen“.

1. `qr-landing-page.tsx`: the link „Trotzdem …“ carries `?neu=1`. The state of
   an unknown or inactive token gets its own heading and text and no action
   button; the page keeps the app header of the public pages.
2. `report-form-page.tsx`: with `neu=1` the duplicate box is not shown; a
   direct visit of `/m/:token/neu` (a bookmark, an old sticker link) still
   shows it once.
3. `portal-tickets-page.tsx`: when the API answers that the portal is off,
   the page shows the notice as information (not the error red) and
   nothing else — no list headings, no empty state.
4. i18n `de`/`en`: the heading and text of the invalid token, the info text
   of the switched-off portal.
5. Tests: the landing link carries `neu=1` and the form then shows no
   duplicate box; a direct visit shows it; an unknown token renders no
   button; the switched-off portal renders the notice alone.

## Non-goals

- The 112 notice stays exactly where `PLAN.md` §2 puts it; this package
  does not move or change it. Whether the landing page `/m/:token` carries
  it too is a decision of the office, not of this package.
- No change of the API or of the duplicate rule (WP-M46-03 owns „open“).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test „the form after ‚Trotzdem‘ shows no duplicate
box“ fails before the change.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question (if any): should the landing page `/m/:token` carry the 112
  notice as well (`PLAN.md` §2 names the form and the sticker only)?
