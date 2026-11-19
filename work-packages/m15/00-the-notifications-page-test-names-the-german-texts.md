# WP-M15-00: the notifications page test names the German texts

format: small-model
status: done
depends-on: —
phase: 15
milestone: m15
context-budget: 12k tokens
spec: specs/00-conventions.md §0.1; PLAN.md §3.1
spec-lines: 20

files-read:

- apps/web/src/settings/__tests__/notifications-page.test.tsx (the English expectations)
- apps/web/src/i18n/locales/de/common.json (the texts of the namespace `notifications`)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the convention of the web tests)
- apps/web/src/i18n/index.ts (the language of the test run: `de`)

files-write:

- apps/web/src/settings/__tests__/notifications-page.test.tsx

interfaces:

- the test of the own channels page names the German texts of the interface

## Task

**The gate was red before this package.** The commit `7a4cbd00` translated the
page `/settings/notifications` and updated the readiness-selection and the
web-push tests, but not `notifications-page.test.tsx`: the test still expected
the English texts („Your channels", „Connect the Telegram account", …) while
the page renders the German ones. Eleven of the fifteen tests of the file
failed — before the first package of phase 15 and independently of it.

1. `apps/web/src/settings/__tests__/notifications-page.test.tsx` names the
   German texts of the `common` namespace: the title „Deine Kanäle", the
   states „Noch nicht verknüpft", „Kein Konto nötig" and „Folgt in einem
   späteren Paket", the buttons „Telegram-Konto verknüpfen",
   „Matrix-Konto verknüpfen", „Matrix-Konto entfernen" und „WhatsApp Web Konto
   entfernen", the field labels „Matrix-ID" und „Zugangstoken" and the linked
   accounts „Telegram-Konto verknüpft: Chat-ID 4711" and „Matrix-Konto
   verknüpft: alice@example.org".
2. The same file names the German error and hint texts: „Der Code ist
   ungültig", „Der Homeserver hat die ID und den Token zurückgewiesen",
   „Das Matrix-Konto wurde entfernt.", „Das WhatsApp Web Konto wurde entfernt."
   and the hint of the channel administration.
3. The convention of the other web tests stays: the run of the tests uses the
   German interface, so the test asserts the German texts.

## Non-goals

- No change of the page and no change of the locale files: the texts are
  already there (`7a4cbd00`).
- No change of the other test files of the page.
- No new key in the locale files.

## Acceptance

```bash
npm run test:run
npm run lint
npm run wp:check
```

Expected: all green; the eleven failing tests pass without a change of the
product.

## Handoff

- Files changed: `apps/web/src/settings/__tests__/notifications-page.test.tsx`
- Interfaces added: none — the test names the texts that exist
- Verified: the commands above
- Follow-up WP: WP-M15-01 (the spec, ADR-0035 and the split) — the file exists
  in the commit of the split
- Open question: none
