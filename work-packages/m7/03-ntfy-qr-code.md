# WP-M7-03: QR code for ntfy topic subscription (web UI + i18n)

format: small-model
status: planned
depends-on: WP-M7-01
phase: 7
context-budget: 20k tokens
spec: PLAN.md §16 (Phase 7 — Notifications), PLAN.md §7 (QR codes for objects/stickers), specs/06-report-form.md
spec-lines: 30

files-read:

- PLAN.md (§7 QR codes)
- apps/web/src/i18n/index.ts
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/api/src/config/env.ts

files-write:

- apps/web/src/features/settings/NtfySubscription.tsx (new component)
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/i18n/index.ts (register namespace if a new one is used)

interfaces:

- `NtfySubscription` React component: reads `NTFY_PUBLIC_URL` + `NTFY_TOPIC` (passed as props or from env), renders a QR code with `https://<NTFY_PUBLIC_URL>/<NTFY_TOPIC>` (or `ntfy://<topic>` deep-link option), label text from i18n
- i18n keys: `ntfy.subscribe`, `ntfy.qrLabel`, `ntfy.appHint` in `common` namespace (de + en)

## Task

1. `apps/web/src/features/settings/NtfySubscription.tsx`: React component that renders a QR code for subscribing to the ntfy topic. QR payload: `https://<publicUrl>/<topic>` (web URL, works in any browser and redirects to the ntfy app) plus an optional `ntfy://<topic>` deep-link toggle. Shows an i18n label ("In der ntfy-App abonnieren") and a hint ("mit dem Handy scannen").
2. `apps/web/src/i18n/locales/de/common.json` + `en/common.json`: add `ntfy.subscribe`, `ntfy.qrLabel`, `ntfy.appHint` keys (German reference, English complete).
3. If a dedicated `ntfy` namespace is preferred over `common`: create `apps/web/src/i18n/locales/{de,en}/ntfy.json` and register it in `apps/web/src/i18n/index.ts`.

## Non-goals

- No ntfy server setup (user operates their own or uses ntfy.sh).
- No API route to fetch topic config — the topic is static from `NTFY_TOPIC` env, baked into the build or passed as props.
- No push permission UI (browser web push) — this is about the ntfy app subscription.
- No 112 emergency number changes (the 112 hint stays on the report form and QR stickers).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `npm run i18n:check` confirms de/en key parity for the new `ntfy.*` keys.

## Handoff

- Files changed: component + two locale files (+ i18n index if new namespace)
- Interfaces added: `NtfySubscription` component, `ntfy.*` i18n keys
- Deviation: if `common` namespace is used, no new i18n registration is needed
- Follow-up WP: WP-M7-04 (wire ntfy send into ticket creation / outbox)
- Open question: whether `NTFY_PUBLIC_URL`/`NTFY_TOPIC` are exposed to the browser via build-time env (`VITE_*`) or passed as component props from a settings page that fetches them from the API
