# WP-M14-72: Random ntfy topic per user and backup of the ntfy volume

format: small-model
status: done
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
- apps/api/src/notifications/__tests__/receivers.unit.spec.ts (new tests)

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

- Files changed: `apps/api/src/notifications/accounts.ts` (exported
  `newNtfyTopic()`; `storeAccount` replaces an empty `externalId` of an ntfy
  account with it), `apps/api/src/notifications/receivers.ts` (`ntfyRecipients`
  answers the stored topics only; `userTopic` stays for the internal paths of
  `outbox.ts`), `docker-compose.yml` (the `backup` service mounts
  `ntfydata:/data/ntfy:ro` and tars it into `stoerdesk-<stamp>-ntfy.tar.gz`),
  new `apps/api/src/notifications/__tests__/receivers.unit.spec.ts`, fixture
  updates in `outbox.unit.spec.ts` and in
  `phase14-exit.integration.spec.ts` (user B now reconnects over a stored
  random topic instead of a derived one)
- Interfaces added: `newNtfyTopic(): string` in
  `apps/api/src/notifications/accounts.ts`
- Verified: `npm run wp:check`, `npm run typecheck --workspaces --if-present`,
  `npm run lint`, `npm run test:run` (1300 tests, 194 files) and the full
  `npm run check` incl. e2e green; the receivers spec, the outbox spec and the
  phase-14 exit spec ran against the throwaway database and pass.
  `docker compose config` unverified (this development container has no
  Docker CLI/daemon; the compose file was checked as YAML instead: the mount
  parses, `ntfydata` stays declared).
  The count of existing accounts with a user-id-derived topic is unverified
  here (no instance database); the SQL is
  `SELECT COUNT(*) FROM notification_accounts WHERE channel = 'ntfy'
   AND external_id = ('stoerdesk-' || user_id::text)`
- Follow-up WP: WP-M14-72b — the subscription QR shows the stored topic (its file
  exists in this commit; the QR route still derives `stoerdesk-<userId>`)
- Open question: whether the ntfy user database should be in the backup at all,
  or the operator re-runs `npm run ntfy:setup` after a restore
