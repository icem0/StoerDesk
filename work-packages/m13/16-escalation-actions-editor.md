# WP-M13-16: The action editor

format: small-model
status: planned
depends-on: WP-M13-15, WP-M13-07
phase: 13
milestone: m13
context-budget: 24k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 40

files-read:

- specs/07-escalation.md §7.5
- packages/shared/src/schemas/escalation-config.ts (the action contracts)
- apps/web/src/admin/webhooks-page.tsx (the endpoint list)
- apps/web/src/admin/escalation-page.tsx (the page of WP-M13-15)
- apps/api/src/notifications/channels/index.ts (the configured channels)

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx

interfaces:

- the action editor: the type (`notify`, `webhook`, `history`), the
  configuration and the condition of an action
- the channel list and the webhook endpoint list of the installation

## Task

1. Build the action editor: the type, the channels of a `notify` action (the
   configured channels), the endpoints of a `webhook` action (the endpoints of
   the administration) and the text of a `history` action.
2. The condition of an action uses the condition builder of WP-M13-15.
3. Add, change, remove and reorder the actions of a rule; the order is the
   order of the dispatcher.
4. Add the German and English texts and the component test: a webhook action with
   a condition is saved, a `notify` action without a channel is refused.

## Non-goals

- No action that changes a ticket (ADR-0017).
- No new channel or a new webhook delivery mechanism.
- No change to the dispatcher.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/web/src/admin/__tests__/escalation-actions-editor.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; the test proves the editor, the condition and the refusals.

## Handoff

- Files changed: the page, the action editor, the two locale files, the test
- Interfaces added: `EscalationActionEditor`
- Verified: typecheck, the component test, the i18n check
- Follow-up WP: WP-M13-17 — the exit criterion of the phase
- Open question: none
