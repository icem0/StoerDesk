# WP-M14-152: the ticket history names the escalation and the notification

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/07-escalation.md §7.7; specs/10-notifications.md §11.8; specs/07-escalation.md §7.5, §7.9
spec-lines: 50

depends-on: WP-M14-151

## Task

The office read the history of a ticket and could not tell what happened:

1. three rows „Benachrichtigung gesendet / System" — where was what sent, which
   channel, which recipient of the configured escalation level?
2. „Eskalation / System" — which stage? the first one means „Neu", that entry can
   be spared; every further stage has a name and must show it.

This package is the **spec and the split** — no product code:

1. `specs/07-escalation.md` §7.7: the history names the stage of a firing with the
   display name the administration maintains; the firing of the first stage keeps
   its audit row and its actions but shows no history entry.
2. `specs/10-notifications.md` §11.8: the payload of `notification_sent` and
   `notification_failed` carries the rule and the stage that queued the row, the
   addressee of a personal delivery and the name of the configured target.
3. `PLAN.md` §16: the record of the chain and of its split.

The chain is split into **WP-M14-152a** (the outbox event names its rule, its
stage and its addressee), **WP-M14-152b** (the escalation names the target it was
configured for) and **WP-M14-152c** (the ticket history renders stage, channel,
recipient and target and spares the first stage).

## Non-goals

- No change of the audit trail: the `escalated` event of the first stage stays in
  the database and the firing keeps its actions.
- No new route, table or column: the display names come from the stage rows the
  ticket view may already read (`GET /api/v1/escalation-stages`, §7.9).
- No translation of a pool name or of a user name: both are installation data
  (§3.1).

## Acceptance

```bash
npm run wp:check
npm run i18n:check
```

Expected: both green; the two spec sections and the four WP documents exist.

## Handoff

- Files changed: `specs/07-escalation.md`, `specs/10-notifications.md`,
  `PLAN.md` §16, `work-packages/README.md`, `CHANGELOG.md`, the four WP files
- Interfaces added: the payload keys `rule`, `stage`, `recipient`, `target` of
  `notification_sent`/`notification_failed`; display names in the history
- Verified: `npm run wp:check` and `npm run i18n:check`
- Follow-up WP: WP-M14-152a, WP-M14-152b, WP-M14-152c — the three files are
  created in this commit (`AGENTS.md`, _Open follow-ups (mandatory closure)_)
- Open question: none
