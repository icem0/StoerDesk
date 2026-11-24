# ADR-0048: The alarm of the instance — the tone belongs to the installation, the mute to the user

- Status: accepted
- Date: 2026-11-24
- Stakeholders: office, on-call technicians, administration

## Context

The alarm of StörDesk reached the user in three different ways, and none of them
was a decision of the installation:

1. The **tone** was a checkbox on the inbox page (`/notifications`) — the choice
   of one browser, stored in its `localStorage`. The office could not say "this
   installation alarms with a tone"; every browser decided for itself, and the
   choice was hidden in the inbox where nobody looks for it.
2. The **alarm** was the number on the bell: a badge that grows. Nothing on the
   page said "there is an unhandled alarm" — the office had to know the badge
   and look at it.
3. The **setup warning** — the rule of the administration (§11.9, ADR-0045) —
   lived on the own notifications page only. A user who never opened that page
   never learned that his setup does not fulfil the rule of the instance. The
   office named it a very important alarm; the implementation showed it as a
   small amber box on one page.

The office asked for three things:

- the decision whether a tone is played belongs to the **settings of the
  installation**, not to a single browser,
- the **mute** is a decision of the user and lasts **one hour** — and it
  silences the **sound only**: the bell keeps shining and keeps moving while
  there are unhandled messages,
- the alarm is **repeated**: the sound comes again and again until the
  messages are handled, and the **interval is a setting of the installation**.

## Decision

1. **The tone is a property of the installation.** The setting
   `notifications.alarm_tone_enabled` (an/aus) belongs to the administration
   and is edited with the other notification settings. There is no per-channel
   and no per-user switch: the office either alarms with a tone or it does not.
2. **The interval is a property of the installation.** The setting
   `notifications.alarm_repeat_seconds` (default 60 s, 15 s … 600 s) says how
   often the sound comes again while unhandled messages exist. The **interval
   governs the sound only** — the visual alarm does not repeat in that rhythm:
   it appears once, shines and moves until the messages are handled.
3. **The mute belongs to the user and lasts one hour.** The setting
   `notifications.mute.<userId>` holds the end of the silence; it is written on
   the server, so it holds for every device of that user. The mute silences the
   **sound only** — the band and the bell keep shining.
4. **The alarm band lives in the shell.** The band appears on every internal
   page while unhandled messages exist, shines and moves, and carries the
   button „1 Stunde stumm“ with the remaining time and the button „Ton
   aktivieren“ — the gesture a browser needs before it may play a sound at
   all. The bell of the menu moves in the same rhythm.
5. **The setup warning is shown on every page.** The warning of §11.9 is not a
   small box on one page any more: it is a large band at the top of the shell,
   it names the missing channels, it links to the setup and it cannot be
   dismissed — a warning that can be clicked away is no warning.
6. **The tone of the inbox page leaves the inbox page.** The checkbox of the
   inbox is gone; the sound belongs to the installation and the silence to the
   user.

## Alternatives

- **The tone per browser, only moved to another page.** Rejected: the office
  asked for a decision of the installation — a browser that decides for itself
  cannot be relied on in an alarm.
- **The mute per browser.** Rejected: a user who mutes on the phone is still
  called on the laptop — the silence has to follow the user, not the device.
- **The visual alarm repeats in the interval of the sound.** Rejected: a band
  that pulses every minute is noise; the band is a state, the sound is the
  repetition.
- **The setup warning as a toast.** Rejected: a toast disappears, and this
  warning is the most important one of the layer.

## Consequences

- The administration owns two more settings; both are read on every internal
  page of every user.
- The mute is a row of the settings table per user — the same write-only place
  the pending codes of the confirmation live (§11.3a).
- The pushed alarm asks the open page for the sound (`postMessage` to the
  clients): a service worker has no Web Audio, only the page may play a tone.
- The public pages (`/m/:token`, `/s/:token`, `/tv/:token`) lie outside the
  shell and carry neither band.
