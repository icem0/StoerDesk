# ADR-0019: The channel configuration and the account linking live in the database

- Status: accepted
- Date: 2026-11-12
- Stakeholders: administration, office, on-call technicians

## Context

Phase 7 delivered the six adapters of the outbox. Their configuration lives in
the environment: `NTFY_URL`, `MATRIX_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN` and
the rest. A change of a channel means a change of the deployment and a restart
of the API, and the plan demands an administration of the channels (§12 of
`PLAN.md`): the admin defines the mandatory minimum channels of critical
tickets, the users choose their channels per event type, the accounts are
linked and a failed channel is warned about.

The table `notification_channels` exists since migration `0019` but no code
reads or writes it. There is no route, no page and no account of a user; the
Telegram adapter posts to one fixed chat id of the environment, the Matrix
adapter to one fixed room, the ntfy topic is the topic of the environment. The
Web Push adapter reads the subscriptions of `push_subscriptions`, but no route
and no page writes that table, so the channel never receives a subscription.

## Decision

1. **The configuration of a channel is a row of `notification_channels`** with
   the columns `kind` (unique), `enabled`, `label`, `config` (the public
   settings) and `secret` (the write-only secret). The environment stays the
   fallback for a kind without a row, so an instance that is configured by the
   environment keeps working and a row can be added at any time.
2. **The accounts of the users live in `notification_accounts`** with one row
   per user and channel, the link of the user to the address at the channel and
   the write-only secret of the account (the Matrix access token).
3. **The selection of the channels per event type lives in
   `notification_preferences`**, one row per user, event type and channel.
4. **The mandatory minimum channels of critical tickets live in the settings row
   `notifications.minimum_channels`**.
5. **The secrets are write-only** — never answered, never logged, never part of
   an event payload. The rule of ADR-0005 applies to the channels and to the
   accounts. The administration answers `secretSet: boolean`.
6. The administration of the channels is the page `/admin/channels`, the own
   channels and the own selection are the page `/settings/notifications`; both
   are entries of the settings menu.

The contract is `specs/10-notifications.md` §11.1–§11.14.

## Alternatives

- **The environment only.** Rejected: the admin cannot change a channel
  without a deployment, the plan demands an administration, and the account of
  a user cannot live in an environment at all.
- **A configuration file in the volume.** Rejected: it is not transactional, it
  is not auditable, it cannot be changed in the administration and it would
  need a second secret store next to the database.
- **A secret manager (Vault, SOPS) instead of the database.** Deferred: the
  stored secret follows the rule of ADR-0005, which the BMAcloud key already
  follows; a secret manager is a decision of the hosting model (§19) and not a
  part of this phase.
- **A row per target instead of one row per channel.** Rejected: a channel
  with several targets (a Telegram group, a Matrix room) is a configuration of
  the channel; the targets of a user are accounts.

## Consequences

- The API reads the configuration of the channels from the database before it
  sends; a short-lived pool per send keeps the worker free of a long-lived
  connection.
- The environment stays supported and documented as the fallback; a channel
  that is configured in both places uses the database.
- The administration can test a channel without a deployment and without a
  restart of the API.
- The stored secrets are as protected as the BMAcloud key: write-only and never
  logged, but stored in the database. A change of the threat model needs a new
  ADR.
