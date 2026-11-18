# WP-M14-123: the ntfy setup guide names the topic-prefix ACL

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/10-notifications.md §11.1, §11.3; PLAN.md §12, §15
spec-lines: 15

depends-on: WP-M14-70, WP-M14-72

files-read:

- scripts/ntfy-setup.sh (the ACL the setup script creates)
- apps/api/src/notifications/receivers.ts (the personal topic of a recipient)
- docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (the ACL rule)
- .env.example (the ntfy block)

files-write:

- docs/DEPLOYMENT.md
- README.md
- .env.example

interfaces:

- The installation guide states that the user of `NTFY_TOKEN` needs read-write
  on the topic prefix `stoerdesk-*` and `everyone` (or a dedicated recipient
  user) read-only, and names both symptoms: without the write entry the test
  message arrives while every real notification ends `http_403`; without the
  read entry the publish succeeds ("gesendet") but the recipient's personal link
  answers `403`.

## Task

A deployment with an access-controlled ntfy server granted the token user
read-write on the single topic `stoerdesk` only. The test message of the
channel card arrived, so the administration looked healthy, but every ticket
notification failed with `403` — the personal topics `stoerdesk-<random>` of
`notification_accounts.external_id` were not covered by the ACL. The setup
script of WP-M14-70 creates the prefix entry, but the guide never said it, so a
server that already existed was configured by hand and got it wrong.

1. In `docs/DEPLOYMENT.md` §Notifications/ntfy, name the two ACL entries — the
   token user read-write and `everyone` (or a dedicated recipient user)
   read-only on `stoerdesk-*` — with the `ntfy access` commands, and explain
   that `NTFY_TOPIC` alone only covers the test message and the verification
   code. Name both symptoms: the missing write entry fails the delivery with
   `http_403`, the missing read entry lets the delivery succeed while the
   recipient's personal link answers `403`.
2. In `README.md` of the installation section, add the same warning in one
   paragraph with a link to the guide, because the test message hides the write
   gap and "gesendet" hides the read gap.
3. In `.env.example`, note the prefix requirement next to `NTFY_TOPIC` and
   `NTFY_TOKEN`.

## Non-goals

- No change of `scripts/ntfy-setup.sh` — it already creates both entries.
- No product code, route, schema or UI change.
- No new environment variable.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the guide names the prefix ACL and the `403` symptom.

## Handoff

- Files changed: `docs/DEPLOYMENT.md`, `README.md`, `.env.example` and this WP
- Interfaces added: the documented ACL requirement of an access-controlled ntfy server
- Verified: `npm run check`
- Follow-up WP: none
- Open question: none
