# WP-M14-03: The messenger channels — specification, decisions and the split of the phase

format: small-model
status: planned
depends-on: WP-M14-02
phase: 14
milestone: m14
context-budget: 28k tokens
spec: PLAN.md §12, §16, §17, §19; specs/10-notifications.md
spec-lines: 200

files-read:

- PLAN.md (§12 notifications, §16 roadmap, §17 limits, §19 open decisions)
- specs/10-notifications.md, specs/README.md
- apps/api/src/notifications/channels/index.ts, apps/api/src/notifications/outbox.ts
- apps/api/src/db/schema.ts
- packages/shared/src/permissions.ts
- docs/DECISIONS.md, docs/REPO-MAP.md

files-write:

- specs/10-notifications.md
- docs/DECISIONS/0019-channel-configuration-and-account-linking.md, docs/DECISIONS/0020-whatsapp-web-over-an-external-bridge.md, docs/DECISIONS.md
- PLAN.md (§12, §16, §19), work-packages/README.md, CHANGELOG.md
- work-packages/m14/ (WP-M14-04 … WP-M14-21, each file in this commit)

interfaces:

- `specs/10-notifications.md` §11.1–§11.14 — the channel contract of phase 14
- `docs/DECISIONS/0019-channel-configuration-and-account-linking.md`
- `docs/DECISIONS/0020-whatsapp-web-over-an-external-bridge.md`

## Task

1. Fill `specs/10-notifications.md` with the reviewed contract of the channels:
   the configuration of every channel, the account linking of Telegram, Matrix,
   ntfy and WhatsApp Web, the selection of the channels per event type, the
   mandatory minimum channels of critical tickets, the content of a message and
   the warning on a failed channel.
2. Add ADR-0019 (the configuration and the account linking live in the
   database, the environment stays the fallback) and ADR-0020 (WhatsApp Web is
   an external bridge, StörDesk ships no browser session).
3. Update `PLAN.md` §12, §16 and §19 with the decisions.
4. Announce the split: the documents `work-packages/m14/04-…` … `21-…` exist in
   this commit, the backlog of `work-packages/README.md` gets their rows.
5. Bookkeeping: one `docs` entry in `CHANGELOG.md`. No product code.

## Non-goals

- No schema, service, route, job, UI or test code.
- No change of the six adapters that exist today.
- No decision about the hosting of the WhatsApp Web bridge — ADR-0020 only
  names the contract StörDesk speaks.

## Acceptance

```bash
npm run wp:check
npm run check
git grep -n "WP-M14" -- work-packages/
```

Expected: `wp:check` green with the new documents valid; `check` green because
the package changes documentation only; the grep shows every `m14` document and
its backlog row.

## Handoff

- Files changed: the notification slice, the two ADRs, the plan, this document,
  the eighteen sibling documents, the backlog and the changelog
- Interfaces added: the contracts of `specs/10-notifications.md` §11.1–§11.14
- Verified: `npm run wp:check`, `npm run check`
- Follow-up WP: WP-M14-04 … WP-M14-21 (each file exists in this commit)
- Open question: none
