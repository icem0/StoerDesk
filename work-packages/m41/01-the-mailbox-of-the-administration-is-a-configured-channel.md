# WP-M41-01: The mailbox of the administration is a configured channel

format: ctx-256k
status: done
depends-on: WP-M24-17 (the mailbox of the instance), WP-M14-51 (the ntfy token of the row)
phase: 41
milestone: m41
context-budget: 46k tokens
spec: specs/10-notifications.md §11.2, §11.5a, §11.11; PLAN.md §12, §16, §17
spec-lines: 120
changed-lines: 700

files-read:

- PLAN.md (§12 the notifications, §16 the current state, §17 the profiles)
- specs/10-notifications.md (§11.2 where the configuration lives)
- apps/api/src/notifications/config.ts
- apps/api/src/notifications/channels/index.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/receivers.ts
- apps/web/src/admin/email-page.tsx
- apps/web/src/admin/channel-form-parts.tsx
- apps/api/src/notifications/__tests__/config.unit.spec.ts
- apps/api/src/notifications/__tests__/routes.unit.spec.ts
- docs/REPO-MAP.md
- work-packages/README.md

files-write:

- apps/api/src/notifications/config.ts
- apps/api/src/notifications/channels/index.ts
- apps/api/src/notifications/routes.ts
- apps/api/src/notifications/outbox.ts
- apps/web/src/admin/email-page.tsx
- apps/api/src/notifications/__tests__/config.unit.spec.ts
- apps/api/src/notifications/__tests__/outbox.unit.spec.ts
- apps/api/src/notifications/__tests__/outbox-worker.unit.spec.ts
- apps/api/src/notifications/channels/__tests__/index.test.ts
- apps/api/src/notifications/__tests__/phase41-exit.integration.spec.ts
- apps/web/src/admin/__tests__/email-page.test.tsx
- docs/REPO-MAP.md
- PLAN.md
- CHANGELOG.md
- work-packages/README.md
- work-packages/m41/01-the-mailbox-of-the-administration-is-a-configured-channel.md (this document)

interfaces:

- `readEmailChannelConfiguration(database, env): Promise<EmailChannelConfiguration>` — the effective configuration of the e-mail channel with its state
- `emailEnvironment(env, email?): Env` — the environment the adapters read with the saved configuration
- `POST /api/v1/admin/channels/email/test` sends with the saved configuration of the row

## Task

The office configured the SMTP connection of Office 365 in the administration
and the test message answered „Testnachricht fehlgeschlagen: The channel is not
completely configured“. The registry of the channels knew the **environment**
alone (`configuredChannels(env)`), and the environment of the installation
carries no SMTP key — so the mailbox of the administration was no channel of
the instance, although §11.2 says that the row of the administration wins over
the environment. The ntfy channel had this case solved since WP-M14-51 (the
verified target replaces the environment before the registry is built); the
e-mail channel never got it.

1. **The effective configuration of the e-mail channel.**
   `readEmailChannelConfiguration(database, env)` in
   `apps/api/src/notifications/config.ts` reads the row of the kind `email` and
   merges it over the environment: a value of the row wins, an empty value of
   the row falls back to the environment, the write-only secret of the row wins
   over `SMTP_PASSWORD`. The answer carries the state: `usable` is true while a
   host and a sender are there, `enabled` is true while the administration did
   not switch the channel off.
2. **The environment with the saved configuration.** `emailEnvironment(env,
   email)` in `apps/api/src/notifications/channels/index.ts` returns the
   environment the adapters read: the values of the row of the administration,
   and empty SMTP values for a channel that the administration switched off —
   the e-mail channel then stays out of the registry of the channels.
3. **The adapter sends with the effective configuration.** The closure of the
   e-mail channel reads the row through the new reader instead of reading the
   row a second time with its own merge: the host, the port, the sender, the
   display name and the templates come from one place, and the rule of §11.2
   (an empty value of the row falls back to the environment) holds for the
   adapter too.
4. **The test send uses the saved configuration.**
   `POST /api/v1/admin/channels/:kind/test` builds its registry with the saved
   configuration of the kind — the ntfy target as before, the mailbox of the
   administration for the e-mail kind. A mailbox that the office saved answers
   the refusal of the mail server (`send_failed`), never the missing
   configuration (`channel_not_configured`).
5. **The notifications go out over the mailbox.** The enqueue of the outbox and
   the drain build their registry with the same environment: a ticket of the
   instance is announced over the mailbox of the administration, and the
   escalation chain of §12 knows the channel.
6. **The interface names the reason.** The page of the mailbox
   (`/admin/email`) shows the reason of a failing test send in words
   (`admin.delivery.reasons.*`) instead of the machine code, and a request that
   never reached the API shows the text of its code.
7. **The tests.** The unit tests of the reader and of the environment, the exit
   criterion of the phase against a real database (the test send reaches the
   mail server of the row, the ticket goes out over the mailbox) and the case
   of the page.

## Non-goals

- No change of the SMTP protocol, of the adapter `channels/email.ts` and of
  the templates of §11.5a.
- No provider of Office 365, no OAuth and no app password of Microsoft: the
  mailbox is a plain SMTP connection.
- No change of the other channels of the administration (telegram, matrix,
  signal): their rows are still read by the adapters alone — the lists of the
  channels are the work of **WP-M41-02**.
- No change of the emergency rule of `PLAN.md` §2 and no contact data in the
  log, in a test or in a fixture.

## Acceptance

```bash
npm run check:static
npx vitest run apps/api/src/notifications
npx vitest run apps/web/src/admin/__tests__/email-page.test.tsx
npm run check
```

Expected result: all green; the new cases fail before the change and pass
after it. The exit criterion needs PostgreSQL and is skipped without it.

## Handoff

- Files changed: the effective configuration of the channels, the registry of
  the channels, the test send, the outbox, the page of the mailbox and their
  tests
- Interfaces added: `readEmailChannelConfiguration`, `emailEnvironment`
- Verified: `npm run check:static`, `npm run check` (299 files / 2126 tests),
  the exit criterion of the phase against a real database
- Follow-up WP: **WP-M41-02** (the e-mail channel is named in the lists of the
  channels — the health of the channels, the fallback of a user without a
  channel, the rule of the administration and the stages of the escalation)
- Open question: none
- Notes: the document of the follow-up (WP-M41-02) is part of this commit — a
  `Follow-up WP:` line without a document is a defect, not a backlog entry
  (`AGENTS.md`, _Open follow-ups (mandatory closure)_).
