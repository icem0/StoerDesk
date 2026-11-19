# WP-M14-173: the operator guide names the diagnosis of the web push

format: small-model
status: done
depends-on: WP-M14-172
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.15
spec-lines: 12

files-read:

- docs/VAPID-SETUP.md (the operator guide of the channel)
- apps/api/src/notifications/channels/web-push.ts (the codes of a failed send)
- apps/api/src/notifications/config.ts (the VAPID trio of the channel)
- apps/api/src/notifications/outbox.ts (the log line of a failed send)
- docs/REPO-MAP.md (the map of the modules)

files-write:

- docs/VAPID-SETUP.md (the diagnosis, the codes and the renewed keys)
- docs/REPO-MAP.md, CHANGELOG.md, work-packages/README.md, this document

interfaces:

- the section „Wenn nichts ankommt: die Diagnose“ of `docs/VAPID-SETUP.md` —
  the codes of a failed web push and what to do for each of them
- the section „Schlüssel erneuert: die Geräte müssen sich neu anmelden“ — the
  way back after a renewal of the keys

## Task

**The fault of the office (out of band in phase 14).** The web push of the
instance delivered nothing and the operator had no guide: the page of the
delivery problems named the code `send_failed` and the log of the API named no
cause at all.

1. `docs/VAPID-SETUP.md` gains the section **„Wenn nichts ankommt: die
   Diagnose"**: the command that reads the log of the failed sends, the table of
   the codes of the web push (`push_unauthorized`, `push_unreachable`,
   `push_rejected`, `vapid_key_mismatch`, `push_subscription_dead`, `no_keys`)
   with the cause and the action for each of them, the check of the egress from
   the API container and the check of the configuration of the channel — the row
   of the administration against the `.env`.
2. The guide names the renewal of the keys: an Abo belongs to the key pair it
   was created with, the browser keeps the old one, and the way back is
   „abmelden und wieder anmelden" — the card of the settings page does it on
   its own since v1.1.332 (WP-M14-172).
3. `docs/REPO-MAP.md` names the new sections of the guide, `CHANGELOG.md` gains
   the entry and `work-packages/README.md` gains the row.

## Non-goals

- No change of the code, of the API, of the contracts and of the interface.
- No change of the guide in the app (`/help/web-push`) — it is the guide of the
  **first** setup, this one is the guide of a **broken** channel.
- No new ADR: the rules of the change are in `specs/10-notifications.md` §11.2
  and §11.3 (WP-M14-170, WP-M14-172).

## Acceptance

```bash
npm run lint
npm run i18n:check
npm run wp:check
```

Expected: all green; the guide names every code of the adapter.

## Handoff

- Files changed: `docs/VAPID-SETUP.md`, `docs/REPO-MAP.md`, `CHANGELOG.md`,
  `work-packages/README.md`
- Interfaces added: none — a document for the operator
- Verified: `npm run lint`, `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none — the web push is closed for phase 14
- Open question: none
