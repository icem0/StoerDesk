# WP-M25-07: the warning of the setup and the exit criterion of the phase

format: ctx-256k
status: done
depends-on: WP-M25-06
phase: 25
milestone: m25
context-budget: 48k tokens
spec: specs/10-notifications.md §11.9, §11.12, §11.17; PLAN.md §16 (phase 25)
spec-lines: 120
changed-lines: 420

files-read:

- specs/10-notifications.md §11.9 (the rule of the administration), §11.17 (the alarm of the instance)
- apps/api/src/notifications/compliance.ts (`readUserCompliance` — the compliance of the signed-in user)
- apps/api/src/notifications/routes.ts (`GET /api/v1/notifications/compliance`, `GET /api/v1/notifications/alarm`, `GET /api/v1/notifications/mute`)
- apps/web/src/components/Shell.tsx (the shell of the app)
- apps/web/src/components/alarm-banner.tsx (the band of the alarm, WP-M25-06)
- apps/web/src/settings/notifications-page.tsx (the warning of the own page, WP-M24-16)

files-write:

- apps/web/src/components/setup-warning-band.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/components/__tests__/setup-warning-band.test.tsx
- apps/api/src/notifications/__tests__/phase25-exit.integration.spec.ts

interfaces:

- `GET /api/v1/notifications/compliance` — the compliance of the signed-in user (`missing`, `compliant`)
- `SetupWarningBand` — the large band of the shell for a user who does not fulfil the rule

## Task

The rule of the administration (§11.9) warns and never blocks: a user who does
not fulfil it carries a large band on **every internal page** that names the
missing channels and links to the setup — a warning that can be clicked away is
no warning (§11.17, ADR-0048). Today the warning lives on the own page of the
notifications only, so a user who never opens that page never sees it. The
phase 25 ends with this band in the shell and with the exit criterion of the
phase.

1. **The component** `apps/web/src/components/setup-warning-band.tsx`: it reads
   `GET /api/v1/notifications/compliance` behind the session and renders
   nothing when the answer is compliant or when the rule of the administration
   is off. Otherwise it renders a large band at the top of the content that
   names the missing channels (the names of the kinds, never the addresses of
   the user) and links to the setup (`/settings/notifications`). The band has
   no close button and no "dismissed" state — it disappears when the rule is
   fulfilled, not when the user clicks it away.
2. **The shell** `apps/web/src/components/Shell.tsx` mounts the band above the
   content of the internal pages, next to the band of the alarm (WP-M25-06).
   The public pages (the report form, the status page) never carry it.
3. **The texts** in `apps/web/src/i18n/locales/de/common.json` and
   `.../en/common.json`: the heading of the warning, the list of the missing
   channels and the link to the setup. The texts follow the language rules of
   `PLAN.md` §3; no key is added to the locales twice.
4. **The test of the component**
   `apps/web/src/components/__tests__/setup-warning-band.test.tsx`: a compliant
   answer renders nothing, an answer with missing channels renders the band
   with the names of the channels and the link to the setup, and the band has
   no button that removes it.
5. **The exit criterion of the phase**
   `apps/api/src/notifications/__tests__/phase25-exit.integration.spec.ts` (in
   the manner of `phase24-exit.integration.spec.ts`): the settings of the
   alarm answer `notifications.alarm_tone_enabled` and
   `notifications.alarm_repeat_seconds` and are written by the route behind
   `settings.write`; the mute of a user ends after one hour and silences the
   sound only; the compliance of a user names the missing channels and the
   flag of the rule. The test names every acceptance item of the phase and
   proves that nothing of the rule blocks a login, an assignment or a delivery.

## Non-goals

- No change of the API — the routes of the compliance and of the alarm exist
  (WP-M24-15, WP-M25-03) and keep their contracts.
- No change of the band of the alarm (WP-M25-06) and of the sound.
- No administration of the rule — WP-M24-15 and WP-M24-18 own it.
- No change of the delivery, of the outbox or of the inbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the test of the component and the exit criterion of the
phase fail before the change and pass after it; `npm run i18n:check` reports no
missing and no unused key.

## Handoff

- Files changed: the component of the band, the shell, the two locales, the
  test of the component and the exit criterion of the phase
- Interfaces added: `SetupWarningBand` — the large band of the shell for a
  user who does not fulfil the rule of the administration
- Verified: the commands above
- Follow-up WP: none — phase 25 is closed
- Open question: none
