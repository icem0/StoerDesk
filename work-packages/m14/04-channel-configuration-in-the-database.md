# WP-M14-04: The configuration of the channels lives in the database

format: small-model
status: planned
depends-on: WP-M14-03
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.2, §11.10; PLAN.md §12
spec-lines: 60

files-read:

- specs/10-notifications.md §11.2, §11.10
- apps/api/src/db/schema.ts (the tables of phase 7)
- apps/api/src/notifications/channels/index.ts (the registry of the adapters)
- apps/api/src/notifications/outbox.ts (the worker and the enqueue)
- apps/api/src/config/env.ts (the keys of the channels)

files-write:

- apps/api/src/db/schema.ts, apps/api/src/db/migrations/0032_notification_channel_config.sql
- apps/api/src/notifications/config.ts

interfaces:

- `readChannelConfiguration(database, env): Promise<ChannelConfiguration[]>`
- `ChannelConfiguration` — kind, enabled, label, config, secretSet

## Task

1. The migration `0032_notification_channel_config.sql` extends
   `notification_channels` with the columns `kind` (unique), `enabled`,
   `label`, `config` (jsonb) and `secret` (text, write-only), and creates the
   tables `notification_accounts` and `notification_preferences` of §11.3 and
   §11.4; the Drizzle schema declares them.
2. `apps/api/src/notifications/config.ts` reads the effective configuration of
   every channel: a row of the table wins over the environment, a kind without a
   row keeps the values of the environment (§11.2).
3. The answer of the service carries `secretSet: boolean` and never the secret
   itself; the environment values are read as today.
4. A unit test proves the precedence: a row wins, a kind without a row falls
   back to the environment, a disabled channel is not configured.

## Non-goals

- No route, no page, no change of an adapter.
- No encryption of the stored secret — the rule of ADR-0005 applies as it is.
- No change of the outbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the migration applies on a throwaway database and the
service answers the effective configuration without a secret.

## Handoff

- Files changed: the schema, the migration, the new configuration service and
  its test
- Interfaces added: `readChannelConfiguration`, `ChannelConfiguration`
- Verified: `npm run check`
- Follow-up WP: WP-M14-05 — the configuration API of the channels
- Open question: none
