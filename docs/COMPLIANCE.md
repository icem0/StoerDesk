# Compliance

> Placeholder from `work-packages/m1/10-ci-workflow.md` (WP-M1-10), translated into
> English by WP-M1-10c.

## Data protection (GDPR)

- Personal data (reporter contact details, photos) is processed for the purpose of
  the malfunction report only.
- No PII is logged in plain text (see the conventions in `docs/REPO-MAP.md`).
- Access requests and erasure requests follow the reporting path described in
  `SECURITY.md`.

## Retention

| Data                        | Retention                     | Responsible       |
| --------------------------- | ----------------------------- | ----------------- |
| Tickets and ticket timeline | per `specs/14-nfr.md`         | instance operator |
| Photos of a report          | per `specs/14-nfr.md`         | instance operator |
| Sessions                    | per `specs/00-conventions.md` | instance operator |
| Logs                        | per `specs/14-nfr.md`         | instance operator |

## Consent

Consent for processing photos and contact details is collected in the report form
(`specs/06-report-form.md`).

## Open points

- Finalize the retention periods (depends on `specs/14-nfr.md`).
- Name the responsible party in the legal notice of the deployment.
