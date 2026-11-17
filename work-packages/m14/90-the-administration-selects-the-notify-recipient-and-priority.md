# WP-M14-90: the administration selects the notify recipient and priority

format: small-model
status: done
depends-on: WP-M14-89
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 25

files-read:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

files-write:

- apps/web/src/admin/escalation-action-editor.tsx
- apps/web/src/admin/escalation-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- the notify editor offers `targetKind` (`user`, `pool`), the user/pool list and
  the five ntfy levels
- `GET /api/v1/users` feeds the user target select
- a targeted action saves `channels: ['ntfy']`, the target and the priority

## Task

1. Load the users of the installation in the escalation page and pass them into
   the action editor.
2. Render the notify recipient: a kind select (user/pool), a target select with
   the "channels of the installation" option and, while no target is selected,
   the existing channel multi-select.
3. Render the ntfy priority select with the five levels and the empty
   "ticket priority" default; hide the channel multi-select once a target is set.
4. Add the German and English labels and prove the target and priority shape in
   the action editor test.

## Non-goals

- No engine change (WP-M14-89).
- No per-user routing for channels other than ntfy.
- No change of the offer/assign target editor.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the action editor test passes (9/9).

## Handoff

- Files changed: the action editor, the escalation page, both settings locales,
  the page test and the repository bookkeeping
- Interfaces added: the notify target kind/target/priority controls
- Verified: web typecheck, the action editor test 9/9
- Follow-up WP: none for the notify feature
- Open question: none
