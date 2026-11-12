# WP-M13-18: the escalation page speaks the language of the interface

format: small-model
status: done
depends-on: WP-M13-14, WP-M13-15, WP-M13-16
phase: 13
milestone: m13
context-budget: 20k tokens
spec: specs/07-escalation.md §7.2, §7.4, §7.5; PLAN.md §3.1, §14
spec-lines: 60

files-read:

- specs/07-escalation.md (§7.2 reference events, §7.4 fields, §7.5 actions)
- packages/shared/src/schemas/escalation-config.ts (the closed vocabularies)
- apps/web/src/admin/escalation-page.tsx (the page of WP-M13-14)
- apps/web/src/admin/escalation-condition-builder.tsx (the builder of WP-M13-15)
- apps/web/src/admin/escalation-action-editor.tsx (the editor of WP-M13-16)
- apps/web/src/admin/bma-sync-page.tsx (the locale pattern of `i18n.language`)

files-write:

- apps/web/src/admin/escalation-page.tsx, apps/web/src/admin/escalation-condition-builder.tsx, apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx

interfaces:

- the option labels of the escalation administration: stage names, reference
  events, condition fields and operators, action types and channels
- `settings:admin.escalation.rule.referenceEvents.*`,
  `condition.fields.*`, `condition.operators.*`, `action.types.*`,
  `action.channels.*`

## Task

1. Stage headings, reference events, condition fields and operators and action
   types show their i18n label instead of the raw key; the stage name follows
   the language of the interface (`names[language] ?? names.de`).
2. Channels of a `notify` action are labelled in the interface language and
   fall back to their id for an unknown channel.
3. The broken German texts of the page are repaired (English leftovers,
   inverted word order, the nonsensical `any` mode and the add/remove labels).
4. Add the component test that renders the page in `de` and in `en` and asserts
   the localized labels; the two editor tests keep their button names unchanged.

## Non-goals

- No new route, schema, rule or action of the escalation; the saved values stay
  the technical keys.
- No language switcher (`specs/13-ui.md` stays a placeholder).
- No translation of a webhook endpoint id or of a rule key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/web/src/admin/__tests__/escalation-page-localization.test.tsx
npm run i18n:check
npm run wp:check
```

Expected: all green; in `en` no German stage name and no raw field, operator or
action type is left in the DOM.

## Handoff

- Files changed: the page, the condition builder, the action editor, the two
  locale files, the new test
- Interfaces added: the label maps above; the saved payload is unchanged
- Verified: typecheck, the component test, the i18n check, `npm run check`
- Deviation: channels of an unknown id keep their id through `defaultValue`
- Follow-up WP: none
- Open question: none
