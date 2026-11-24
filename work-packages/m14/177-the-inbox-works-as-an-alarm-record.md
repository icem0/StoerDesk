# WP-M14-177: the inbox works as an alarm (retroactive record)

format: small-model
status: done (retroactive record — commit `d8d2d0e6` landed 2026-11-24 with the subject
`feat(web): the inbox works as an alarm`, without a WP id and without a work-package
document; the record adds no behaviour, it states what the commit did and which rule
still lacks a test)
depends-on: WP-M14-120d, WP-M14-120e, WP-M14-127
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.12 (the inbox as an alarm), §11.16 (the admin view of
the inbox), PLAN.md §14 (user interface)
spec-lines: 40

files-read:

- apps/web/src/features/notifications/inbox-page.tsx — the inbox as it is now
- apps/web/src/components/notification-bell.tsx — the bell and the count
- apps/web/src/lib/alarm-tone.ts — the tone of this browser
- apps/web/src/sw.ts — the pushed alarm
- specs/10-notifications.md §11.12, §11.16 — the contract of the inbox
- work-packages/m14/120d-notification-inbox-ui.md — the inbox this commit builds on

files-write:

- work-packages/m14/177-the-inbox-works-as-an-alarm-record.md — this record
- work-packages/m14/178-the-alarm-tone-of-the-browser-has-a-test.md — the announced
  follow-up, created in this same commit (`AGENTS.md`: a split creates files, not
  sentences)
- work-packages/m20/06-the-duty-blocks-satisfy-their-criterion.md — deleted: the
  stale draft of the criterion of phase 20 that the split left behind next to
  WP-M20-08 (the same package under a second number)
- work-packages/README.md, PLAN.md §16, CHANGELOG.md — the backlog of record and the
  status of the phase

interfaces:

- none new — the commit added `apps/web/src/lib/alarm-tone.ts` with
  `isAlarmToneEnabled()`, `setAlarmToneEnabled(enabled)`,
  `onAlarmToneChange(listener)` and `playAlarmTone()`; the inbox and the bell read
  them

## Task (what commit `d8d2d0e6` actually did)

1. `apps/web/src/lib/alarm-tone.ts` is new: the choice of the alarm tone is a choice
   **of this browser** (`localStorage`, key `stoerdesk.alarm-tone`, off by default) and
   not of the account, so nobody is surprised by a tone on a stranger's device. The
   tone is built from the Web Audio oscillators of the browser — no audio file, no
   download, no licence question — and a browser without Web Audio, a browser that
   blocks the storage and a device without sound stay silent.
2. The inbox of `inbox-page.tsx` became the fastest way from an alarm to the work:
   the title of a ticket message is a link into `/tickets/:ticketNo` (a readiness
   message names a pool and stays plain text), every unread message carries **its
   own** quittature button with its own pending state (a slow receipt never blocks
   the next), a refused receipt is named on the page, and the unread-only filter is
   available to every session — the addressee filter stays the right of
   `notification.read_all` (§11.16).
3. The list of the inbox and the bell of the shell ask again every half minute, so
   an alarm appears without a reload.
4. The bell sounds the tone when the unread count rises; the inbox writes the choice
   and confirms it with the tone itself (the click is the gesture a browser needs to
   allow the sound).
5. The service worker shows a pushed alarm with `requireInteraction` and a
   vibration pattern, so it stays visible until the user acts on it.
6. `specs/10-notifications.md` §11.12 gained the paragraph „The inbox is an alarm",
   `common.json` (de, en) gained `inbox.alarmTone`, `inbox.alarmToneHint` and
   `inbox.acknowledgeError`, `docs/REPO-MAP.md` names the new module.

## Non-goals

- No change of the API: `GET /api/v1/notifications/messages` already answered the
  filters of §11.16 for the own inbox — the commit only offers them in the page.
- No sound file, no notification permission, no change of the push channel.
- No change of the emergency rule of `PLAN.md` §2 — nothing of the inbox touches the
  report path of the customers.

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
```

Expected: all green; the record changes no behaviour, so no test changes its result.

## Handoff

- Files changed: this record, `work-packages/m14/178-…` (the announced follow-up,
  created here), the deleted stale draft of phase 20, plus `work-packages/README.md`,
  `PLAN.md` §16, `CHANGELOG.md`
- Interfaces added: none — the module of the commit is named above
- Verified: `npm run check` green (E2E 13/13); the module of the commit has no unit
  test of its own — that is WP-M14-178
- Deviation: the commit landed before this record existed and named no WP — the reason
  this document was written
- Follow-up WP: WP-M14-178 (the unit test of the tone of this browser), file created
  in this commit
- Open question: none
