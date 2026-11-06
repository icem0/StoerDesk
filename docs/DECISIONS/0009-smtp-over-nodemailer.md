# ADR-0009: SMTP transport via nodemailer

- Status: accepted
- Date: 2026-11-06
- Stakeholders: office, manager, admin

## Context

`PLAN.md` §12 lists e-mail (SMTP) as an external notification channel and
`PLAN.md` §16 phase 7 names it in its content line, so WP-M7-07 has to send
through it. `PLAN.md` §19 fixes no SMTP library and the API declares none: the
existing channel adapters (WP-M7-01 … WP-M7-05) reach their service over `fetch`
because ntfy, Signal and Matrix are HTTP APIs. SMTP is not — it is a socket
protocol with a STARTTLS upgrade on the `SMTP_PORT=587` default of
`.env.example`, and Node has no public API to upgrade a plain socket to TLS.
Writing a partial SMTP client would leave the configured default unspported.

## Decision

`apps/api` depends on `nodemailer` (`^10.3.1`). The e-mail adapter in
`apps/api/src/notifications/channels/email.ts` keeps the shape of the other
adapters — an `EmailConfig` built from the existing `SMTP_*` environment keys, an
`EmailError` with a `code`, and the injectable last parameter of the module
(`createTransport`, defaulting to the nodemailer factory) so a unit test injects
a mock transport and never reaches a mail server. `configuredChannels(env)`
enables the `email` channel only when `SMTP_HOST` and `SMTP_FROM` are set and
appends it last, so the escalation chain of `PLAN.md` §12 becomes
signal → matrix → ntfy → email.

The message content stays what `outbox.ts` (WP-M7-04) carries: ticket number as
subject, priority and object name as body, plus the deep link labelled with the
shared `notification.action_label` (WP-M7-04b). No photo, no contact data, no
HTML.

## Alternatives

- **A hand-written SMTP client over `node:net`/`node:tls`.** Rejected: the
  STARTTLS upgrade of the 587 default is not expressible with the public Node
  API, and a client without it silently breaks the documented default
  configuration.
- **An HTTP-based SMTP relay (a mail-server API in the Compose stack).** Rejected:
  `PLAN.md` §12 states that no notification server is part of the stack.
- **Deferring e-mail to a later phase.** Rejected: `PLAN.md` §16 already lists
  SMTP in the content of phase 7.

## Consequences

- The channel supports STARTTLS (587) and TLS (465) through one dependency that
  is already widely used and maintained.
- One more runtime dependency in the `api` image; `apps/api` bundles with
  `--packages=external`, so the package resolves in `node_modules` at runtime.
- Passwords reach nodemailer as `auth.pass` only — never a log line, never an
  error message (`PLAN.md` §6 data-protection rules).
