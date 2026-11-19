# WP-M17-02: the administration separates the target from the way

format: small-model
status: done
depends-on: WP-M17-01
phase: 17
milestone: m17
context-budget: 16k tokens
spec: specs/07-escalation.md §7.5; specs/10-notifications.md §11.4, §11.12; ADR-0037
spec-lines: 40

files-read:

- apps/web/src/admin/escalation-action-editor.tsx (the target and the channels of an action)
- apps/web/src/i18n/locales/de/settings.json (the texts of the action)
- apps/web/src/i18n/locales/en/settings.json (the texts of the action)
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx (the pattern of the test)

files-write:

- apps/web/src/admin/escalation-action-editor.tsx (the target select and the hint)
- apps/web/src/i18n/locales/de/settings.json and
  apps/web/src/i18n/locales/en/settings.json (the texts of the action)

interfaces:

- the label `admin.escalation.action.targetChannels` — the empty target reads
  as the broadcast of the installation
- the hint `admin.escalation.action.notifyHint` — the target receives the
  message over the way it chose itself

## Task

1. `apps/web/src/admin/escalation-action-editor.tsx` shows the two decisions
   apart: the empty entry of the target select reads as the **broadcast of the
   installation** (the channels of the installation are its way), every other
   entry is a **person** — a technician, a readiness pool or the technicians of
   the ticket. The label of the select stays „Ziel“.
2. The hint below a target names the rule of ADR-0037: the target receives the
   message over the channels **it selected itself** under
   `/settings/notifications`; without a selection it receives it on its own
   ntfy topic.
3. The channel select stays the way of the broadcast and is only shown without a
   target; the editor no longer writes a `channels` list into a notify action
   with a target — the dispatcher ignores it anyway.
4. The texts of `de` and `en` follow: `admin.escalation.action.targetChannels`
   and `admin.escalation.action.notifyHint` are rewritten, no new key is added.
5. The test `apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx`
   proves that a target hides the channel select, that the hint names the
   selection of the recipient and that the empty target reads as the broadcast.

## Non-goals

- No change of the other actions (`webhook`, `history`, `status_change`,
  `offer`, `assign`) and no change of the conditions.
- No new page, no new route and no new permission.
- No change of the page of the channels (`/admin/channels`) and no change of the
  own page — that is WP-M17-03.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/admin/escalation-action-editor.tsx`,
  `apps/web/src/i18n/locales/de/settings.json`,
  `apps/web/src/i18n/locales/en/settings.json`, the test
  `apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx`
- Interfaces added: the texts `admin.escalation.action.targetChannels` (the empty
  target reads as the broadcast of the installation) and
  `admin.escalation.action.notifyHint` (the target receives the message over the
  way it chose itself)
- Verified: `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run test:run`, `npm run wp:check`
- Follow-up WP: WP-M17-03 (the file exists in the commit of the split)
- Open question: none
