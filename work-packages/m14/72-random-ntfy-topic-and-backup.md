# WP-M14-72: Random ntfy topic per user and backup of the ntfy volume

format: small-model
status: planned
depends-on: WP-M14-69, WP-M14-70
phase: 14
milestone: m14
context-budget: 20k tokens
spec: docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md (points 6, consequences)
spec-lines: 40

files-read:

- docs/DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md
- apps/api/src/notifications/receivers.ts (the topic derived from the user id)
- apps/api/src/notifications/accounts.ts (the stored ntfy account)
- apps/web/src/features/settings/NtfySubscription.tsx (the subscription QR)

files-write:

- apps/api/src/notifications/receivers.ts
- apps/api/src/notifications/accounts.ts
- docker-compose.yml (the `backup` service: mount of `ntfydata`, read-only)

interfaces:

- `newNtfyTopic(): string` — `stoerdesk-` plus 128 random bits, base32 or hex, no
  user id in it
- `ntfyRecipients(database, eventType)` keeps its signature; it returns the stored
  topic of each user

## Task

1. A new ntfy account gets a topic from `newNtfyTopic()` (crypto random, 128 bits,
   `stoerdesk-` prefix so the ACL pattern of ADR-0024 matches). The topic is stored
   in `notification_accounts.external_id`.
2. A user without a stored account gets no topic from the user id any more. The
   fallback `stoerdesk-<userId>` of `receivers.ts` is removed; a user without an
   account receives no ntfy message.
3. Existing accounts with a topic derived from the user id keep working until the
   user reconnects; the subscription QR shows the stored topic, so the operator
   must re-subscribe those phones. Report the number of such accounts in the
   handoff (a SQL count, no names).
4. `docker-compose.yml`, service `backup`: mount the volume `ntfydata` read-only at
   `/data/ntfy`, so the backup profile archives the ntfy user database; the archive
   carries no plaintext token (the token is stored hashed by ntfy).
5. Tests: a unit test that the topic has the prefix and 128 random bits; a test that
   a user without an account gets no topic.

## Non-goals

- No migration of topics by the server; re-subscription is the operator's step.
- No change of the ntfy adapter (ADR-0022 token handling stays).

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the new tests fail before the change and pass after it. The
backup archive is verified only when Docker runs (unverified otherwise).

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: whether the ntfy user database should be in the backup at all,
  or the operator re-runs `npm run ntfy:setup` after a restore
