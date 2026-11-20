# WP-M15-08: the web push card names the cause of a failing test send

format: small-model
status: done
depends-on: WP-M15-07d
phase: 15
milestone: m15
context-budget: 14k tokens
spec: specs/10-notifications.md §11.15
spec-lines: 12

files-read:

- apps/web/src/admin/channels-page.tsx (the reason of a failed test send)
- apps/api/src/notifications/channels/web-push.ts (the codes of a failed send)
- apps/api/src/notifications/routes.ts (`failureCode` of a test send)
- apps/web/src/i18n/locales/de/settings.json (`admin.channels.errors.*`)
- apps/web/src/i18n/locales/en/settings.json (the English counterpart)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the page test)

files-write:

- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/channels-page.test.tsx
- specs/10-notifications.md, CHANGELOG.md, docs/REPO-MAP.md,
  work-packages/README.md, this document

interfaces:

- the texts `admin.channels.errors.no_keys`, `.vapid_key_mismatch`,
  `.push_unauthorized`, `.push_rejected`, `.push_unreachable`,
  `.push_subscription_dead` in `de` and `en`

## Task

**The fault of the office (out of band in phase 15).** A failing test send of the
web push card showed „Der ntfy-Server hat den Code push_unreachable geantwortet:
Prüfen Sie URL und Thema und versuchen Sie es erneut." — a web push has no topic
and no ntfy server. The adapter names the cause (WP-M14-171) and the page of the
delivery problems explains it, but the card translates the code through
`admin.channels.errors`, which only carries the texts of the ntfy channel — an
unknown code falls back to the ntfy sentence and names the machine code inside it.

1. `de` and `en` gain the six texts of the web push in `admin.channels.errors`:
   `no_keys`, `vapid_key_mismatch`, `push_unauthorized`, `push_rejected`,
   `push_unreachable`, `push_subscription_dead`. Each text names the cause and
   the action of the operator (the VAPID trio on this card, the registration of
   the device, the egress of the API container) — never an endpoint, never a key.
2. The page test drives the web push card with `code: 'push_unreachable'` and
   expects the new German text, not the ntfy sentence.
3. `specs/10-notifications.md` §11.15 states that the card of the channel
   administration names the cause of a failing web push in the interface
   language.
4. `docs/REPO-MAP.md` names the texts on the row of the channel page.

## Non-goals

- No change of the adapter, of `failureCode` or of any route: the codes are
  right already.
- No change of the texts of the delivery page (`admin.delivery.reasons.*`).
- No new machine code and no new fallback: an unknown code keeps its current
  answer.

## Acceptance

```bash
npm run i18n:check
npm run typecheck --workspaces --if-present
npm run test:run
npm run check
```

Expected: green; the failing test send of the web push names its cause.

## Handoff

- Files changed: the two locale files, the page test, the spec section,
  `CHANGELOG.md`, `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: the six texts of the web push in `admin.channels.errors`
- Verified: `npm run i18n:check`, `npm run typecheck`, `npm run test:run`
- Follow-up WP: none — the web push of phase 15 is closed
- Open question: none
