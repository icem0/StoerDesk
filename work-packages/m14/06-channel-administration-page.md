# WP-M14-06: The administration page of the channels

format: small-model
status: planned
depends-on: WP-M14-05
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.1, §11.12; PLAN.md §12, §14
spec-lines: 60

files-read:

- specs/10-notifications.md §11.1, §11.12
- apps/web/src/admin/api-keys-page.tsx (the pattern of an admin page)
- apps/web/src/settings/settings-page.tsx (the entries of the menu)
- apps/web/src/routes/index.tsx (the route table)
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/routes/index.tsx, apps/web/src/settings/settings-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `ChannelsPage` — the administration page at `/admin/channels`
- the entry `auth.links.channels` of the settings menu

## Task

1. The page `/admin/channels` lists every channel of §11.1 with its state
   (configured, disabled, failed), its public configuration and `secretSet`;
   the fields of the configuration are editable, the secret is a write-only
   field that never shows the stored value.
2. The page sends a test message per channel and shows the answer; a failed
   channel is marked with the time of its last failure.
3. The route `/admin/channels` is registered behind `RequireSession`, and the
   settings menu gets the entry "Kanäle" in the administration group — the
   place of the planned card of the removed administration home.
4. The texts are added in `de` and `en` under `settings:admin.channels.*`.

## Non-goals

- No account of a user, no selection of the channels, no warning in the menu.
- No change of the dashboard tile.
- No edit of the environment values — they are the fallback of §11.2.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the page shows the channels of the API, the secret field
stays empty after a save and the test message reports the result.

## Handoff

- Files changed: the new page, the route table, the settings menu, the two
  locale files and the tests
- Interfaces added: `ChannelsPage`, the route `/admin/channels`
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-07 — the content of the message and the urgency of ntfy
- Open question: none
