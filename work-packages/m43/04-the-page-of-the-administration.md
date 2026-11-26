# WP-M43-04: the page of the administration and the entry of the menu

format: ctx-256k
status: planned
depends-on: WP-M43-03
phase: 43
milestone: m43
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.13 (the switch), §19.11 (the pages)
spec-lines: 40
changed-lines: 480

files-read:

- specs/19-customer-portal.md §19.11 (the pages), §19.13 (the switch)
- apps/web/src/admin/dashboard-settings-page.tsx (the pattern of an administration page)
- apps/web/src/settings/settings-page.tsx (the menu of the settings)
- apps/web/src/routes/index.tsx (the routes of the administration)
- apps/web/src/features/customer/portal-tickets-page.tsx (the pages of the portal)
- apps/web/src/i18n/locales/de/settings.json (the texts of the administration)

files-write:

- apps/web/src/admin/customers-settings-page.tsx
- apps/web/src/admin/__tests__/customers-settings-page.test.tsx
- apps/web/src/settings/settings-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/features/customer/portal-tickets-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/i18n/locales/de/help.json, apps/web/src/i18n/locales/en/help.json
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/i18n/locales/de/customer.json, apps/web/src/i18n/locales/en/customer.json

interfaces:

- `/admin/customers` — the page of the administration
- the entry „Kundenportal“ in the settings menu
- `admin.customers.*` — the texts of the page

## Task

1. **The page** `apps/web/src/admin/customers-settings-page.tsx`: the switch
   of the portal and the switch of the registration. The registration stays
   disabled while the mailbox is broken, the page names the reasons and links
   to the mailbox of the instance (`/admin/email`).
2. **The menu** carries the entry „Kundenportal“ (`/admin/customers`), the
   route of the page lies behind the session.
3. **The portal** shows a clear notice while the portal is switched off
   (`customer_portal_disabled`) instead of an empty list.
4. **The texts** in `de` and `en`: the menu entry, its explanation, the page
   and the notice of the portal.
5. **The test** proves that the page writes the switch and that the
   registration stays locked while the mailbox is broken.

## Non-goals

- No change of the portal itself.
- No text of the office in the portal.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the page, the menu, the route, the portal and the texts
- Interfaces added: the page and the entry of the menu
- Verified: the commands above
- Follow-up WP: none — the phase is closed
- Open question: none
