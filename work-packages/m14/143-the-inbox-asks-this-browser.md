# WP-M14-143: the inbox asks this browser

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.1, §11.12
spec-lines: 20

depends-on: WP-M14-142

files-read:

- apps/web/src/features/notifications/inbox-page.tsx (the inbox of WP-M14-120d)
- apps/web/src/lib/web-push.ts (the probe of WP-M14-142)
- apps/web/src/i18n/locales/de/common.json (the texts of the inbox)
- specs/10-notifications.md §11.12

files-write:

- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/features/notifications/__tests__/inbox-page.test.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `useBrowserPush()` of `apps/web/src/lib/web-push.ts` — the state of this
  browser (WP-M14-142)
- `inbox.webpush.hint`, `inbox.webpush.setup`, `inbox.webpush.unsupported`,
  `inbox.webpush.denied`, `inbox.webpush.notConfigured` (de/en) — the texts of
  the hint; the hint names the cause it found

## Task

**The claim without a check.** The inbox shows „Push notifications are not
enabled in this browser yet.“ whenever the account of the user has no device on
the server — a statement about the browser that was never asked, and a wrong
one when another device of the account is registered.

1. The inbox reads the probe of WP-M14-142 and shows the hint only when **this
   browser** has no push subscription.
2. The hint names the cause it found: a browser without a push manager, a
   blocked permission, a browser without a subscription or a server without a
   VAPID key get four different texts. A browser that did not answer gets no
   hint at all — nothing is claimed without a check.
3. The link to `/settings/notifications` stays with the causes the user can fix
   in the browser; the missing server configuration is named without a link.
4. The texts of the inbox come from the locale files: the German file carries
   the English sentence of WP-M14-128 today — the German texts replace it.

## Non-goals

- No subscribe action on the inbox page — registering stays on the settings
  page.
- No change of the API of WP-M14-124.
- No change of the card.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the inbox names the cause of the four states and stays
silent when the browser answers with a subscription.

## Handoff

- Files changed: the inbox page, its test and the two locale files
- Interfaces added: the texts of the causes of the hint
- Verified: —
- Follow-up WP: none
- Open question: none
