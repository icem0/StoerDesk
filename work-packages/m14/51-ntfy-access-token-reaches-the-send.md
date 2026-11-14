# WP-M14-51: The access token of the ntfy server reaches every send

format: small-model
status: done
depends-on: WP-M14-04, WP-M14-47, WP-M14-49
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.1, §11.2, §11.11, §11.13, §11.14
spec-lines: 40

files-read:

- specs/10-notifications.md §11.2, §11.11, §11.13
- PLAN.md §12
- apps/api/src/notifications/config.ts (effective configuration)
- apps/api/src/notifications/verification.ts (effective ntfy target)
- apps/api/src/notifications/routes.ts (test send)
- apps/api/src/notifications/outbox.ts (enqueue, drain)

files-write:

- apps/api/src/notifications/{config.ts,verification.ts,routes.ts,outbox.ts}
- apps/api/src/notifications/__tests__/{config.unit.spec.ts,verification.unit.spec.ts,routes.unit.spec.ts,outbox-worker.unit.spec.ts}
- specs/10-notifications.md (§11.2, §11.13, §11.14), docs/DECISIONS/0022-ntfy-access-token-as-the-channel-secret.md, docs/DECISIONS.md
- work-packages/m14/51-ntfy-access-token-reaches-the-send.md

interfaces:

- `ChannelConfiguration.token` (internal, not in `channelConfigurationSchema`)
- `effectiveNtfyConfig(database, env, { requireVerified }): NtfyConfig | null`
  with `token`
- `configuredChannels({...env, NTFY_TOKEN})` — the admin test send and the drain
  read the row's `secret` as the `NTFY_TOKEN` of the send

## Task

The office runs a self-hosted ntfy server that answers `403` for a publish
without an access token; StörDesk stored the key in the write-only `secret` of
the `ntfy` row (and in `NTFY_TOKEN`) but never sent it. ADR-0022 decides that
the access token of the ntfy server **is** the secret of the channel.

1. `apps/api/src/notifications/config.ts`: the environment fallback of `ntfy`
   reads `NTFY_TOKEN` as its secret, and `readChannelConfiguration` carries that
   secret as `token` for the `ntfy` kind only. `token` stays out of `config` and
   out of `channelConfigurationSchema`, so no answer ever contains it.
2. `apps/api/src/notifications/verification.ts`: `effectiveNtfyConfig` returns
   `{ url, topic, token }`, so `requestNtfyVerification` sends the one-time code
   with the key and the outbox target of §11.2 keeps it.
3. `apps/api/src/notifications/routes.ts`: the admin test send rebuilds the
   registry with `NTFY_TOKEN: effective?.token ?? env.NTFY_TOKEN`.
4. `apps/api/src/notifications/outbox.ts`: `effectiveEnv` sets the same
   `NTFY_TOKEN`, so the drain, the enqueue and the per-user topic rows publish
   with the key of the row.
5. Tests: the row secret wins over the environment, the captured send asserts
   `Authorization: Bearer <token>` for the verification code, the test send and
   the drain, and the channel list answers without a `token` key.

## Non-goals

- No change of the adapter payload, the fingerprint or the priority mapping.
- No per-user ntfy token (§11.3 derives the topic of a user, not a credential).
- No new column, no new environment key and no new route.
- No new error text — the honest `401`/`403` wording is WP-M14-52.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; the new assertions fail before the change, because
no send carried the key.

## Handoff

- Files changed: the four files above plus their unit tests; `specs/10-notifications.md`
  §11.2, §11.13, §11.14; ADR-0022.
- Interfaces added: `ChannelConfiguration.token`, `effectiveNtfyConfig` with `token`.
- Verified: `npm run check` green (see commit log), no answer carries the token.
- Follow-up WP: WP-M14-52 (`52-ntfy-401-and-403-name-the-access-token.md`) — the
  administration explains a refused publication instead of blaming the topic;
  WP-M14-53 (`53-the-ntfy-request-carries-a-timeout.md`) — an unreachable server
  fails as `http_timeout` instead of hanging the drain.
- Open question: none.
