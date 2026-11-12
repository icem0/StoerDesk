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
| [ADR-0017](DECISIONS/0017-workflow-stages-as-escalation-stages.md) | The workflow milestones are the escalation stages | accepted |
| [ADR-0018](DECISIONS/0018-ci-package-mirror-retries.md) | A package-mirror failure in CI is retried, never silenced | accepted |
| [ADR-0019](DECISIONS/0019-channel-configuration-and-account-linking.md) | The channel configuration and the account linking live in the database | accepted |
| [ADR-0020](DECISIONS/0020-whatsapp-web-over-an-external-bridge.md) | WhatsApp Web over an external bridge | accepted |
