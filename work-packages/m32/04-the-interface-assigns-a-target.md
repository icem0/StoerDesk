# WP-M32-04: the interface assigns a target

format: ctx-256k
status: done
phase: 32
milestone: m32
context-budget: 45k tokens
depends-on: WP-M32-03
spec: specs/07-escalation.md §7.14; docs/DECISIONS/0057-the-assignment-names-a-target-of-the-installation.md
spec-lines: 60
changed-lines: 420

files-read:

- apps/web/src/admin/escalation-page.tsx (the tabs of the escalation)
- apps/web/src/admin/escalation-action-editor.tsx (the editor of the actions)
- apps/web/src/admin/escalation-assignee-pool.tsx (the pool of the office)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the picker of the assignment)
- apps/web/src/i18n/locales/de/settings.json (the texts of the administration)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the ticket view)

files-write:

- apps/web/src/admin/escalation-page.tsx (the tab _Pool der Office_ is gone)
- apps/web/src/admin/escalation-action-editor.tsx (the target of the action `assign`)
- apps/web/src/admin/escalation-assignee-pool.tsx (removed)
- apps/web/src/features/tickets/ticket-detail-page.tsx (the picker of the assignment)
- apps/web/src/i18n/locales/de/settings.json (the texts of the administration)
- apps/web/src/i18n/locales/de/ticket.json (the texts of the ticket view)
- apps/web/src/i18n/locales/en/settings.json (the texts of the administration)
- apps/web/src/i18n/locales/en/ticket.json (the texts of the ticket view)

interfaces:

- the picker of the assignment — the readiness pools, the user groups and the technicians of the installation
- the action `assign` in the administration — the target beside the flag _Annahme erforderlich_

## Task

1. The administration of the escalation loses the tab _Pool der Office_ and the
   component of the pool of the office; the configuration is written without
   the list of the office.
2. The editor of the action `assign` offers the target: a readiness pool, a
   user group or one technician — the pools and the groups the page already
   reads — beside the flag _Annahme erforderlich_. The former modes
   (_Aus dem Pool der Office_ and _Fester Techniker_) are gone.
3. The picker of the assignment in the ticket view offers the same targets: the
   pools and the groups with their members, the technicians of the
   installation. The choice sends the target to the route of the assignment.
4. The texts: the tab and the hint of the pool of the office are removed, the
   texts of the target are added in German and English.

## Non-goals

- No change of the offer action and of its picker.
- No removal of the setting `escalation.assignee_pool` — WP-M32-05 drops it.
- No new order for the members of a pool or of a group.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the test of the ticket view assigns a target of a pool and
the test of the action editor writes the target of the action `assign`.

## Handoff

- Files changed: the eight files of `files-write`, the tests of the ticket view
  and of the action editor, CHANGELOG.md, docs/REPO-MAP.md
- Interfaces added: the picker of the target in the ticket view, the target in
  the action editor
- Verified: `npm run check` green (typecheck, lint, i18n, wp, the tests of the API and
  the web, the E2E of the browser) — the test of the ticket view assigns a pool
  and the test of the action editor writes the target of the action
- Follow-up WP: WP-M32-05 (the purge of the rest)
- Open question: none
- Notes: the web sends the target and no longer reads the pool of the office —
  the contract keeps the former fields readable until WP-M32-05 removes them.
