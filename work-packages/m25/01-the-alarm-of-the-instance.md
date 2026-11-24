# WP-M25-01: the alarm of the instance

format: small-model
status: done
depends-on: WP-M24-20
phase: 25
milestone: m25
context-budget: 18k tokens
spec: specs/10-notifications.md §11.9, §11.11, §11.12, §11.17
spec-lines: 60

files-read:

- specs/10-notifications.md (the contract of the chapter)
- apps/web/src/lib/alarm-tone.ts (the tone of the browser)
- apps/web/src/components/Shell.tsx (the shell of the app)
- docs/DECISIONS/0046-the-mailbox-of-the-instance.md (ADR-0046, the last decision of phase 24)

files-write:

- docs/DECISIONS/0048-the-alarm-of-the-instance.md
- specs/10-notifications.md
- PLAN.md

interfaces:

- `notifications.alarm_tone_enabled` — the settings row: whether the installation alarms with a sound
- `notifications.alarm_repeat_seconds` — the settings row: the interval of the repetition of the sound
- `notifications.mute.<userId>` — the settings row: the end of the silence of the user

## Task

1. Write **ADR-0048**: the sound belongs to the installation (an/aus, globally),
   the interval of the repetition belongs to the installation and governs the
   **sound only**, the silence of one hour belongs to the user and silences the
   **sound only**, the alarm band lives in the shell and the warning of an
   unfulfilled setup is a large band on every page that cannot be dismissed.
2. Write **§11.17** of the notifications spec: the settings of the installation,
   the mute of the user, the band of the alarm, the pushed alarm and the
   warning of the setup.
3. Name the routes of §11.11 and the pages of §11.12 and adapt §11.9 — the
   warning of the rule stands on every page.
4. Adapt **PLAN.md** §12 and the roadmap of §16.

## Non-goals

- No code, no migration, no route in this WP — the spec decides, the code follows.
- No change of the inbox page.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the spec, the ADR and the plan name the same model.

## Handoff

- Files changed: the ADR, the spec of the notifications, PLAN.md
- Interfaces added: the three settings rows, the two routes of the alarm
- Verified: the commands above
- Follow-up WP: WP-M25-02 — the shared contracts of the alarm and of the mute
- Open question: none
