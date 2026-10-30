# Security Policy

## Reporting a vulnerability

Please do **not** use public issues for security vulnerabilities.

Report privately instead:

- e-mail the operator of the StörDesk instance you are affected by (the address is
  part of the deployment or the imprint of that instance), or
- open a private vulnerability report on GitHub when the repository you are
  reporting against has enabled it.

Please include:

- the affected component (web, API, Compose setup),
- a description and the steps to reproduce,
- the possible impact,
- any known workaround.

We confirm receipt, keep you informed about the status of the fix and disclose it
after release.

## Supported versions

| Version           | Supported |
| ----------------- | --------- |
| `main`            | yes       |
| released `v0.0.x` | no        |

## Notes for operators

- `SESSION_SECRET` must be set in production: the API refuses to start with the
  development default value.
- Never commit `.env`; `.env.example` is the template.
- No personal data in logs (Pino, structured, `{ code, params }` errors).
- The report form and the printed stickers carry the 112 notice — it must never be
  removed (see `README.md` and `specs/06-report-form.md`).
