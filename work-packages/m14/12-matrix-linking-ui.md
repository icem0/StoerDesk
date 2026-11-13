# WP-M14-12: The Matrix section of the settings page

format: small-model
status: done
depends-on: WP-M14-11
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.12; PLAN.md §12
spec-lines: 30

files-read:

- specs/10-notifications.md §11.12
- apps/web/src/settings/notifications-page.tsx (the page of WP-M14-10)
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/features/settings/NtfySubscription.tsx (the pattern of a card)

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- the section `notifications.matrix.*` of the own channels page

## Task

1. The Matrix section of `/settings/notifications` takes the homeserver, the
   matrix id and the access token, sends them to the API and shows the linked
   account afterwards.
2. The access token field is a password field, it is never filled again after
   a save and it never appears in the state of the page after a reload.
3. The section offers to remove the account again and shows the error of the
   API (a refused pair, a homeserver that is not reachable) as a text.
4. The texts are added in `de` and `en`.

## Non-goals

- No ntfy, no WhatsApp Web and no selection of the channels.
- No copy of the token into the clipboard and no link to a token generator.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the section stores the account, the token field is empty
after a reload and the error of the API is shown.

## Handoff

- Files changed: the own channels page, the two locale files and the tests
- Interfaces added: the Matrix section
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-13 — the ntfy onboarding with the QR of the subscription
- Open question: none
