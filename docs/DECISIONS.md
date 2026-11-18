# Architecture Decision Records (ADR)

Format: one file per decision in `docs/DECISIONS/`, numbered consecutively.

## Template

```markdown
# ADR-NNNN: Title

- Status: proposed | accepted | superseded by ADR-XXXX
- Date: YYYY-MM-DD
- Stakeholders: <roles>

## Context

<Starting point, constraints>

## Decision

<What is decided>

## Alternatives

<Which alternatives were rejected and why>

## Consequences

<Positive/negative, follow-up>
```

## Index

| ADR                                                           | Title                               | Status   |
| ------------------------------------------------------------- | ----------------------------------- | -------- |
| [ADR-0001](DECISIONS/0001-monorepo-with-npm-workspaces.md)    | Monorepo with npm workspaces        | accepted |
| [ADR-0002](DECISIONS/0002-uuid-v7-as-database-primary-key.md) | UUID v7 as the database primary key | accepted |
| [ADR-0003](DECISIONS/0003-bmacloud-object-sync.md)            | BMAcloud pull sync of objects (Anlagen)                          | accepted — credential rule superseded by ADR-0005 |
| [ADR-0004](DECISIONS/0004-self-update-model.md)              | Self-update model (admin update control)        | accepted |
| [ADR-0005](DECISIONS/0005-bmacloud-api-key-in-settings.md)   | BMAcloud bearer key configurable in the administration          | accepted |
| [ADR-0006](DECISIONS/0006-host-update-agent.md)             | Host update agent topology (profile `update`, same project)    | superseded by ADR-0007 |
| [ADR-0007](DECISIONS/0007-update-check-and-deploy-webhook.md) | Update check in the API and deployment over a deploy webhook | accepted |
| [ADR-0008](DECISIONS/0008-deadline-and-escalation-defaults.md) | Deadline and escalation defaults per priority | accepted |
| [ADR-0009](DECISIONS/0009-smtp-over-nodemailer.md) | SMTP transport for the e-mail channel (nodemailer) | accepted |
| [ADR-0010](DECISIONS/0010-web-push-over-the-web-push-library.md) | Web Push transport (web-push library, `push_subscriptions` rows) | accepted |
| [ADR-0011](DECISIONS/0011-oncall-slot-model-and-swap-approval.md) | On-call slot model, swap approval and calendar feed | accepted |
| [ADR-0012](DECISIONS/0012-dashboard-live-updates-and-statistics.md) | Dashboard live updates, statistics queries and wall-display access | accepted |
| [ADR-0013](DECISIONS/0013-external-api-keys-webhooks-openapi.md) | External API, API keys, webhooks and OpenAPI | accepted |
| [ADR-0014](DECISIONS/0014-privacy-retention-and-restore-drill.md) | Privacy retention, export/erasure and the restore drill | accepted |
| [ADR-0015](DECISIONS/0015-dashboard-evaluation-averages.md) | Dashboard evaluations — average durations only, the worst reaction time stays out | accepted |
| [ADR-0016](DECISIONS/0016-detected-errors.md) | Detected errors: catalog, close storage, statistics grouping | accepted |
| [ADR-0017](DECISIONS/0017-workflow-stages-as-escalation-stages.md) | The workflow milestones are the escalation stages | accepted — the fixed stage count superseded by ADR-0023 |
| [ADR-0018](DECISIONS/0018-ci-package-mirror-retries.md) | A package-mirror failure in CI is retried, never silenced | accepted |
| [ADR-0019](DECISIONS/0019-channel-configuration-and-account-linking.md) | The channel configuration and the account linking live in the database | accepted |
| [ADR-0020](DECISIONS/0020-whatsapp-web-over-an-external-bridge.md) | WhatsApp Web over an external bridge | accepted |
| [ADR-0021](DECISIONS/0021-readiness-allocation-over-the-configured-channels.md) | The readiness allocation announces itself over the configured channels | accepted |
| [ADR-0022](DECISIONS/0022-ntfy-access-token-as-the-channel-secret.md) | The ntfy access token is the write-only secret of the channel | accepted |
| [ADR-0023](DECISIONS/0023-escalation-stage-chain-configurable.md) | The escalation stage chain is configurable (add, remove, predecessor) | accepted |
| [ADR-0024](DECISIONS/0024-ntfy-compose-profile-behind-cloudflare-tunnel.md) | ntfy as an optional Compose profile behind a Cloudflare Tunnel | accepted |
| [ADR-0025](DECISIONS/0025-ticket-transitions-as-database-configuration.md) | The ticket transitions are database configuration (`ticket_transitions`, `0041`) | accepted |
| [ADR-0026](DECISIONS/0026-the-escalation-offers-and-assigns-tickets.md) | The escalation offers and assigns tickets (`offer`, `assign`, `ticket_assignees`) | accepted |
| [ADR-0027](DECISIONS/0027-ticket-number-without-year.md) | The ticket number carries no calendar year (`ST-0001`, one global counter, legacy numbers stay readable) | accepted |
| [ADR-0028](DECISIONS/0028-the-channel-health-warning-goes-over-another-channel.md) | A broken channel warns over another channel, once a day (`push_subscription_dead`, `channel.health_warning`) | accepted |
| [ADR-0029](DECISIONS/0029-the-object-priority-deviates-from-the-standard.md) | The priority of an object deviates from the standard (`object_priority_overrides`, `ticket.default_priority`) | accepted |
| [ADR-0030](DECISIONS/0030-the-readiness-shift-is-a-condition-of-the-escalation.md) | The readiness shift is a condition of the escalation (`shift` field, a pool target reaches the technicians on duty) | accepted |
