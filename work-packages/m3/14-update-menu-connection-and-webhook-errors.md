# WP-M3-14: the update menu tells a lost connection from a refused webhook

format: small-model
status: implemented
depends-on: WP-M3-13
phase: 3
milestone: m3
context-budget: 14k tokens
spec: specs/18-self-update.md §18.4
spec-lines: 30

files-read:

- apps/web/src/admin/update-panel.tsx — the panel of the update menu
- apps/web/src/lib/api.ts — the API client and its `ApiError`
- apps/api/src/update/routes.ts — the start route of the API
- apps/web/src/i18n/locales/de/settings.json — the texts of the panel
- docs/DEPLOYMENT.md — the deployment paths

files-write:

- apps/web/src/admin/update-panel.tsx
- apps/web/src/admin/**tests**/update-panel.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- specs/18-self-update.md

interfaces:

- `admin.update.errors.connection` — no answer at all: the stack restarts
- `admin.update.errors.http` — an unknown answer of the API, with its status
- `admin.update.reload` — reload the page after a start

## Task

A failed start showed one text for every failure, so an admin could not tell a
refused webhook from a lost connection. The deployment replaces the API
container, so the connection of the request can die before the answer arrives —
that is the normal case of a fast deployment and not an error of the
configuration.

1. `apps/web/src/admin/update-panel.tsx`: the text of a failed start tells the
   three cases apart — a known error code of the API, an unknown answer (its
   HTTP status is named) and **no answer at all** (the connection was
   interrupted, the stack is probably restarting). The check has its own text
   for an unknown failure.
2. The panel offers a button that reloads the page after a start, so the new
   version is visible once the stack is back.
3. The texts in the `settings` namespace of `de` and `en`.
4. The tests: the refused webhook, the unknown answer with its status and the
   lost connection.
5. `specs/18-self-update.md` §18.4 and `docs/DEPLOYMENT.md` name the rule for
   the webhook target: it answers immediately and deploys in the background.

## Non-goals

- No change of the API: the order of the webhook call and the answer stays, so
  a refused webhook is still reported.
- No retry of the start: a second start inside five minutes is refused by the
  API.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run test:run -w @stoerdesk/web
npm run check
```

Expected: all green; the panel test proves the three texts.

## Handoff

- Files changed: the panel, its test, the texts, the spec, the deployment guide
- Interfaces added: the texts of the three cases and the reload button
- Verified: pending
- Follow-up WP: none
- Open question: none
