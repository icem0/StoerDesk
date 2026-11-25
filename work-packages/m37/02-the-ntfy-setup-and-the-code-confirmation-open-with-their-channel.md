# WP-M37-02: the ntfy setup and the code confirmation open with their channel

format: ctx-256k
status: done
depends-on: WP-M37-01
phase: 37
milestone: m37
context-budget: 46k tokens
spec: specs/10-notifications.md §11.19, §11.3, §11.3a, §11.12; PLAN.md §14, §16
spec-lines: 160
changed-lines: 420

files-read:

- specs/10-notifications.md §11.19 (the overview of the own channels)
- apps/web/src/settings/notifications-page.tsx (the own page of the channels)
- apps/web/src/features/settings/NtfySubscription.tsx (the card of ntfy)
- apps/web/src/i18n/locales/de/common.json (the texts of the notifications)

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/notifications-page.test.tsx

interfaces:

- the button `notifications.overview.configure` / `notifications.overview.close` — one per channel, with `aria-expanded` and `aria-controls`; the row of `signal` carries no button
- the panel of a channel (`channel-panel-<kind>`) — the setup of the channel, its topic and the confirmation of its code (§11.3a)

## Task

The page `/settings/notifications` was a long column: the setup of every
channel stood at once, so the user had to scroll past six forms to reach the
one he wanted. The overview of the channels (§11.19, WP-M37-01) is the list —
the setup belongs behind a button. This package opens the **ntfy** channel and
the confirmation of the code; the remaining channels follow in WP-M37-03.

1. `apps/web/src/settings/notifications-page.tsx`: the page holds the state
   `openChannel`. Every row of the overview carries a button that opens the
   setup of **its** channel; the button of the open channel closes it again.
   Only one channel is open at a time.
2. The setup of **ntfy** renders only while ntfy is open: the card with the
   topic of the user and its QR code, the test of the own topic and the
   administration hint. The topic is read only while the channel is open — a
   page view never asks for the topic of a channel nobody opened.
3. The confirmation of the code (§11.3a) belongs to the open channel: the
   block with the button „Code senden“, the field of the code and the button
   „Code eingeben“ names the open channel only.
4. The hint of the channel administration moves from the section of ntfy into
   the overview: it names where the configuration of the channels lives, and
   it stands there for every channel.
5. `apps/web/src/i18n/locales/de/common.json` and `.../en/common.json`: the
   texts of the buttons.
6. The test of the page opens ntfy before it reads the topic and proves that
   the topic stays hidden until the button is clicked.

## Non-goals

- The overview and the rule of the administration (WP-M37-01) stay as they are.
- The remaining channels fold away in WP-M37-03 — their setup still stands.
- The setup of a channel is not changed — only when it appears.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/settings/notifications-page.tsx`, the two locales,
  the test of the page
- Interfaces added: the buttons of the overview (`aria-expanded`, `aria-controls`),
  the panel of a channel
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`); the cases of the page run green
- Follow-up WP: WP-M37-03 — it lands with this package: the three packages write
  the same page, and a page that is half written is no page
- Open question: none
