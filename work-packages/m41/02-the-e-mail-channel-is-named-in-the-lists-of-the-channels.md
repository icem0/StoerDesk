# WP-M41-02: The e-mail channel is named in the lists of the channels

format: ctx-256k
status: done
depends-on: WP-M41-01
phase: 41
milestone: m41
context-budget: 42k tokens
spec: specs/10-notifications.md §11.2, §11.9, §11.15; PLAN.md §12, §16, §17
spec-lines: 120
changed-lines: 260

files-read:

- PLAN.md (§12 the notifications, §16 the current state, §17 the profiles)
- specs/10-notifications.md (§11.2, §11.9 the rule of the administration, §11.15 the health of the channels)
- apps/api/src/notifications/health.ts
- apps/api/src/notifications/receivers.ts
- apps/api/src/settings/notifications.ts
- apps/api/src/escalation/routes.ts
- apps/api/src/notifications/config.ts
- apps/api/src/notifications/channels/index.ts
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- docs/REPO-MAP.md
- work-packages/README.md

files-write:

- apps/api/src/notifications/health.ts
- apps/api/src/notifications/receivers.ts
- apps/api/src/settings/notifications.ts
- apps/api/src/escalation/routes.ts
- apps/api/src/notifications/channels/email.ts
- apps/web/src/i18n/locales/de/settings.json
- apps/api/src/notifications/__tests__/health.unit.spec.ts
- apps/api/src/notifications/__tests__/receivers.unit.spec.ts
- apps/api/src/settings/__tests__/notifications.unit.spec.ts
- apps/api/src/notifications/channels/__tests__/email.test.ts
- PLAN.md
- CHANGELOG.md
- work-packages/README.md
- work-packages/m41/02-the-e-mail-channel-is-named-in-the-lists-of-the-channels.md (this document)

interfaces:

- the lists of the channels (`GET /api/v1/escalation/channels`, the rule of the administration, the warning of a broken channel) carry the e-mail channel of the administration
- `admin.delivery.reasons.channel_not_configured` — the German text of the reason

## Task

WP-M41-01 made the mailbox of the administration a channel of the instance: the
test send and the notifications use it. The **lists** of the channels still know
the environment alone, so the office cannot name the mailbox where the channels
are named.

1. **The lists of the channels.** The rule of the administration
   (`apps/api/src/settings/notifications.ts`), the stages of the escalation
   (`apps/api/src/escalation/routes.ts`), the fallback of a user without a
   confirmed channel (`apps/api/src/notifications/receivers.ts`) and the warning
   of a broken channel (`apps/api/src/notifications/health.ts`) build their
   lists with the same environment as the drain: the saved configuration of the
   administration wins over the environment of the installation (§11.2).
2. **The German text of the reason.** `admin.delivery.reasons.channel_not_configured`
   is an English text in the German file — the office read „The channel is not
   completely configured“ on a German page. The text says what the reason
   means: the channel has no target yet.
3. **The machine code of a missing recipient.** The adapter of the e-mail
   channel answers `no_recipient`, while the texts of the delivery page know
   `no_recipients` (the code of the signal channel) — a failing test send with
   an empty recipient list fell back to the generic text. The adapter uses the
   code of the texts.
4. **The tests.** The unit tests of the lists with a row of the administration
   and the case of the texts in both languages.

## Non-goals

- No change of the adapter, of the protocol and of the templates.
- No new list and no new route.
- No change of the emergency rule of `PLAN.md` §2.

## Acceptance

```bash
npm run check:static
npx vitest run apps/api/src/notifications
npm run i18n:check
npm run check
```

Expected result: all green; the new cases fail before the change and pass
after it.

## Handoff

- Files changed: the four lists of the channels, the machine code of a missing
  recipient and the German texts
- Interfaces added: none — the lists carry the e-mail channel of the
  administration
- Verified: `npm run check:static`, `npm run i18n:check`, the cases of the
  notifications, the cases of the settings and of the escalation
- Follow-up WP: none — phase 41 is closed
- Open question: none
- Notes: `docs/REPO-MAP.md` carries no row of this package — the public API of
  the four modules does not change, only the list they answer. The rule of the
  administration reads its list per request: the administration saves a mailbox
  while the server runs, and a list that was read at the start of the server
  would refuse the channel until the next restart.
