# WP-M14-88: the notify action selects a recipient and an ntfy priority

format: small-model
status: done
depends-on: WP-M14-84
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 40

files-read:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/escalation/config.ts
- specs/07-escalation.md

files-write:

- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/escalation/config.ts

interfaces:

- `escalationNotifyTargetSchema` — `{ kind: 'user' | 'pool', id: uuid }`
- `ESCALATION_NOTIFY_PRIORITIES` and `NTFY_PRIORITY_NUMBERS`
- `escalationActionConfigSchema` accepts `target`/`priority` for `notify`
- `PUT /api/v1/escalation/config` answers `400 invalid_target` for an unknown user or pool

## Task

1. Add the notify target and the five ntfy levels to the shared action contract;
   a notify action stays valid with `channels` alone (old configurations) and with
   a `target` alone (new recipient choice).
2. Write the target and the priority into the `config` jsonb of the action and
   read them back unchanged.
3. Validate the target of a notify action against `users` (kind `user`) and
   `oncall_pools` (kind `pool`); an unknown id answers `400 invalid_target` with
   the field path, the rule of the offer/assign target.
4. Extend the action contract test with both target kinds, the priority, the
   channel-only fallback and the two rejects.

## Non-goals

- No dispatcher and no outbox row (WP-M14-89).
- No administration UI (WP-M14-90).
- No per-user routing for channels other than ntfy.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new action contract tests pass.

## Handoff

- Files changed: the shared escalation contract, the configuration service, the
  spec §7.5, the shared test and the repository bookkeeping
- Interfaces added: `escalationNotifyTargetSchema`, `ESCALATION_NOTIFY_PRIORITIES`,
  `NTFY_PRIORITY_NUMBERS`, the `target`/`priority` fields of `notify`
- Verified: typecheck (shared, api), the shared escalation test (30/30)
- Follow-up WP: WP-M14-89 (the engine queues the target rows)
- Open question: none
