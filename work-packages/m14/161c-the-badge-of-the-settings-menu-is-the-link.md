# WP-M14-161c: the badge of the settings menu is the link to the problems

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.8, §11.12
spec-lines: 30

depends-on: WP-M14-161b

files-read:

- apps/web/src/settings/settings-page.tsx (the badge, the sections of the menu)
- apps/web/src/settings/__tests__/settings-page.test.tsx (the test of the badge)
- apps/web/src/i18n/locales/de/common.json (`app.channelWarning.badge`, `auth.links`)

files-write:

- apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/settings-page.test.tsx,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `app.channelWarning.badge` — the badge, now a link to `/admin/delivery`
- `auth.links.delivery` — the entry of the settings menu

## Task

**The badge is the way to the problem (WP-M14-161).**

1. `apps/web/src/settings/settings-page.tsx` reads
   `GET /api/v1/notifications/delivery` instead of the status route and counts
   the **open** problems — the channels with a failure nobody acknowledged. A
   problem that was quit and not renewed disappears from the badge; a failure
   after the quittature brings it back.
2. The badge becomes a `NavLink` to `/admin/delivery`: the text „Zustellung
   gestört (n)“ is the name of the link, so the destination is visible and
   reachable with the keyboard.
3. The settings menu gains the entry `delivery` in the group of the
   administration — the page is reachable without the badge too.
4. The texts of the badge and the new entry live in the `common` namespace in
   `de` and `en`.

## Non-goals

- No change of the channel administration and no change of the dashboard.
- No change of the wording of the badge: the count stays the number of the
  channels with an open problem.
- No badge in the header of the shell.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the link, the count of the open
problems and the silence after the quittature.

## Handoff

- Files changed: the settings page, the texts of the `common` namespace, the
  test and the repository docs
- Interfaces added: `auth.links.delivery`; the badge is a link to
  `/admin/delivery`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`, `npm run test:run`, `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
