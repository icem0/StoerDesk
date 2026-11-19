# WP-M17-00: the recipient chooses the way — the spec, ADR-0037 and the split

format: small-model
status: done
depends-on: WP-M16-03
phase: 17
milestone: m17
context-budget: 18k tokens
spec: PLAN.md §9, §12, §16, §17; specs/07-escalation.md §7.5; specs/10-notifications.md §11.4
spec-lines: 60

files-read:

- specs/07-escalation.md (§7.5 the actions, §7.14 the targets)
- specs/10-notifications.md (§11.1 the channels, §11.3 the accounts, §11.4 the selection)
- apps/api/src/escalation/actions.ts (the `notify` branch of the dispatcher)
- apps/api/src/notifications/receivers.ts (the ntfy recipients of an event)
- apps/web/src/admin/escalation-action-editor.tsx (the target and the channels of an action)
- docs/DECISIONS/0033-the-assignment-names-a-technician.md (the named limitation)

files-write:

- specs/07-escalation.md (§7.5, the effect of a `notify` action with a target)
- specs/10-notifications.md (§11.4, the precedence of the rules)
- docs/DECISIONS/0037-the-recipient-chooses-the-way-of-the-escalation.md and
  docs/DECISIONS.md (the index)
- PLAN.md (§9, §12, §16 phase-17 row and the record),
  work-packages/m17/ (WP-M17-01 … WP-M17-03, each file created in this commit),
  work-packages/README.md and CHANGELOG.md

interfaces:

- `escalationRecipients(database, eventType, userIds)` — the recipients of an
  escalation with their channels and their own ntfy topic
- `specs/10-notifications.md` §11.4 — rule 1 of the precedence
- ADR-0037 — the recipient decides the way of an escalation that names them

## Task

**The comment of the office.** „in der verwaltung der eskalationsstufen gibt es
bei aktionen unter benachrichtigung und bereitschaftspool die ziele zur auswahl
… aber was bitte bedeutet: kanäle der installation … das ziel ist eine person,
der übertragungsweg eine andere geschichte! jeder kann selbst bestimmen unter
/settings/notifications über welchen weg eine benachrichtigung bei welcher art
von nachricht bei ihm verwendet werden soll.“

This package is the **spec and the split** — it writes no product code:

1. `specs/10-notifications.md` §11.4 gets the new precedence: the escalation rule
   of the admin decides **whether** and **to whom** a `ticket.escalated`
   notification goes — the target of the action; the **selection of the
   recipient** decides the way. The channels of the installation belong to the
   `notify` action **without** a target — the broadcast.
2. `specs/07-escalation.md` §7.5 names the same rule for the action: with a
   target, one outbox row per recipient and per channel the recipient selected
   for `ticket.escalated`; a recipient without a selection row receives the
   notification on their own ntfy topic; without a target, one outbox row per
   channel of the installation.
3. Write `docs/DECISIONS/0037-the-recipient-chooses-the-way-of-the-escalation.md`
   (the target answers the *who*, the selection of the recipient answers the
   *how*) and add its row to the index of `docs/DECISIONS.md`.
4. `PLAN.md` §9 and §12 carry the rule, §16 gains the phase-17 row and the
   record of the split.
5. Create the work packages WP-M17-01 … WP-M17-03 in `work-packages/m17/` in
   numeric order: the API → the administration of the escalation → the own page.

## Non-goals

- No product code in this package: no schema, route, page or test code.
- No migration: the selection of the recipient and the accounts of the users
  already exist (`notification_preferences`, `notification_accounts`).
- No personal address for the channels other than ntfy — the routing of the
  other channels to the address of the installation stays the named limitation
  of ADR-0033 decision 4.
- No change of the readiness events: ADR-0021 already gives the technician the
  choice of the channel.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with the three new WP files valid; `check` green,
because this package changes documentation only.

## Handoff

- Files changed: `specs/07-escalation.md` §7.5, `specs/10-notifications.md` §11.4,
  ADR-0037 and its index row, `PLAN.md` §9, §12 and §16, the m17 WP files,
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the resolver `escalationRecipients()` of WP-M17-01, the rule 1
  of the precedence of §11.4 and ADR-0037
- Verified: `npm run wp:check` and `npm run check`
- Follow-up WP: WP-M17-01, WP-M17-02, WP-M17-03 (each file exists in this commit)
- Open question: none
