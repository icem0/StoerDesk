# ADR-0013: External API, API keys, webhooks and OpenAPI

- Status: accepted
- Date: 2026-11-10
- Stakeholders: office, administration, integrations

## Context

`PLAN.md` §11 announces a REST API with bearer API keys, object and ticket
endpoints, webhooks and an OpenAPI document under `/api/docs`. The existing
routes are session-cookie routes guarded by RBAC permissions. Phase 10 has to add
machine access without weakening the office routes and without duplicating the
domain services.

## Decision

1. **Same paths, two authentication modes.** External callers use the existing
   `/api/v1` paths. A route accepts either the session cookie with its permission
   or `Authorization: Bearer <key>` with the matching scope. The session path is
   unchanged; the key path is additive and never raises a permission.
2. **API keys are hashed and shown once.** A key is `sk_` plus 32 random bytes in
   `base64url`. `api_keys` stores only `sha256(token)`, a display prefix, name,
   scopes, creator, `last_used_at`, expiry and revocation. Scopes are
   `objects:read`, `objects:write`, `tickets:read`, `tickets:write`. Management is
   session-only under `apikey.read` / `apikey.write`.
3. **Object and ticket endpoints.** Objects gain `updated_since`, `PUT` upsert,
   bulk upsert and the existing soft delete. Tickets gain `updated_since` listing,
   external creation with `source = 'api'` and the work-order update. External
   ticket actions are recorded as `actor_kind = 'system'` with the key id in the
   event payload.
4. **Webhooks are a separate subsystem.** Admin-managed endpoint rows subscribe
   to `ticket.created` and `ticket.status_changed`. A worker delivers
   asynchronously with HMAC-SHA256 over `<timestamp>.<body>`, five exponential
   retries and a delivery log. The notification outbox is not reused: it models
   human notification channels, not integration callbacks.
5. **OpenAPI covers the external surface.** The document is generated from the
   shared Zod contracts of the external routes and served at `/api/docs` and
   `/api/docs/json`. Office-internal routes stay out of the published document.

## Alternatives

- **Separate `/api/v1/ext` prefix** — rejected: `PLAN.md` §11 names the
  `/api/v1` paths, and clients should not have to know a second surface.
- **Reuse the notification outbox for webhooks** — rejected: its channels,
  fallback chain and message model are user notifications; webhook retries and
  signatures have different semantics.
- **Store plaintext API keys** — rejected: a database leak would hand out machine
  credentials.
- **Annotate every internal route for OpenAPI now** — rejected: it would exceed
  the phase-10 packages and publish office-only contracts. The external surface is
  the documented contract.

## Consequences

- Each new external route needs a dual guard instead of `requirePermission`
  alone.
- API keys cannot act as a user; the audit trail names the key id, not a person.
- Webhook delivery adds two tables and a pg-boss job.
- OpenAPI is authoritative for the external contract and must be updated with
  every external schema change.
