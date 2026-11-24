# WP-M14-178: the alarm tone of the browser has a test

format: small-model
status: done
depends-on: WP-M14-177
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.12 (the alarm tone), §11.14 (the tests)
spec-lines: 12

files-read:

- apps/web/src/lib/alarm-tone.ts — the tone of this browser
- apps/web/src/components/notification-bell.tsx — the bell that sounds the tone
- apps/web/src/lib/**tests**/web-push.test.ts — the shape of a unit test of a module
  of `apps/web/src/lib`
- apps/web/src/components/**tests**/notification-bell.test.tsx — the test of the bell
- specs/10-notifications.md §11.12, §11.14 — the contract and the rule of the tests

files-write:

- apps/web/src/lib/**tests**/alarm-tone.test.ts — the unit test of the module
- apps/web/src/components/**tests**/notification-bell.test.tsx — the test of the
  bell that sounds the tone when the count rises
- work-packages/README.md, PLAN.md §16, CHANGELOG.md, this document

interfaces:

- none new — the test proves the existing contract of `isAlarmToneEnabled()`,
  `setAlarmToneEnabled(enabled)`, `onAlarmToneChange(listener)` and
  `playAlarmTone()`

## Task

Commit `d8d2d0e6` (WP-M14-177) added `apps/web/src/lib/alarm-tone.ts` without a unit
test of its own: the choice of the tone, the change of the choice and the silence
without Web Audio are untested, and the bell that sounds the tone is untested too.
§11.14 asks for a test of every module of the app.

1. `apps/web/src/lib/__tests__/alarm-tone.test.ts` proves the contract of the
   module:
   - the tone is **off** in a fresh browser (`localStorage` empty) and stays off;
   - `setAlarmToneEnabled(true)` writes the choice, `isAlarmToneEnabled()` answers
     `true` afterwards and the choice survives a reload of the page;
   - a browser that refuses the storage (the write throws) stays silent and never
     breaks the caller — the inbox must not fail because of a tone;
   - `onAlarmToneChange(listener)` reports the new choice to a listener and returns
     an unsubscribe function that really stops the reports;
   - `playAlarmTone()` never throws — a browser without Web Audio, a suspended
     context and a device without output stay silent.
2. `notification-bell.test.tsx` proves that the bell sounds the tone **only** when
   the unread count rises and the tone is switched on for this browser: a first
   answer (no rise) stays silent, a rising count sounds the tone, and a browser with
   the tone off stays silent.

## Non-goals

- No change of the module, of the inbox or of the bell: the commit is a test.
- No sound file, no change of the notification permission of the browser.
- No E2E case: a tone cannot be heard by a test — the unit test is the proof.

## Acceptance

```bash
npx vitest run apps/web/src/lib/__tests__/alarm-tone.test.ts apps/web/src/components/__tests__/notification-bell.test.tsx
npm run check
```

Expected: the new tests fail before the change (the files do not exist) and pass
after it; the full gate is green.

## Handoff

- Files changed: `alarm-tone.test.ts`, `notification-bell.test.tsx`,
  `work-packages/README.md`, `PLAN.md` §16, `CHANGELOG.md`
- Interfaces added: none
- Verified: `vitest run` for the two files (5 + 7 tests), `npm run typecheck`,
  `eslint`, `i18n:check`, `wp:check`, `npm run test:e2e` (13/13)
- Follow-up WP: none
- Open question: none
