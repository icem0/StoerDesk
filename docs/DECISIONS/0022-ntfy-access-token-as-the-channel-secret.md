# ADR-0022: The ntfy access token is the write-only secret of the channel

- Status: accepted
- Date: 2026-11-14
- Stakeholders: administration, office, on-call technicians

## Context

An ntfy server does not have to be the public ntfy.sh. A self-hosted server — or
a paid server with access control — answers `401` / `403` when a request carries
no access token, and the ntfy documentation states that the token travels in the
`Authorization: Bearer` header of the publish request (or as `?token=` on a GET,
which is the form a URL would leak). WP-M14-04 and ADR-0019 already gave the
channel a write-only `secret` column and the environment a `NTFY_TOKEN` key, and
the adapter of WP-M7-01 already supports a `token` in its config — but
`readChannelConfiguration` never filled it, so the admin-entered key and the
environment key reached neither the test send, the verification code nor the
outbox. The administration answered a `403` as "the topic belongs to someone
else", which is only one of the two causes and made the operator hunt for a
non-stolen topic.

## Decision

1. **The access token of the ntfy server is the `secret` of the `ntfy` row** of
   `notification_channels`, with the `NTFY_TOKEN` environment value as the
   fallback of a kind without a row (ADR-0019 precedence: a row wins over the
   environment). No new column, no new environment key and no new route.
2. **`ChannelConfiguration.token` is an internal field**: it carries that secret
   to the send so the adapter puts it into the `Authorization` header. It is not
   part of the shared `channelConfigurationSchema`, never part of `config` and
   therefore never answered, never logged, never part of an error text
   (ADR-0005 rule).
3. **Every ntfy send reads the same effective target**: the admin test send, the
   verification code and the outbox drain take the token from the resolved
   configuration, never from the bare environment again.
4. **The token is not part of the verification fingerprint.** The proof of
   WP-M14-47 belongs to the public target (address and topic); a changed key
   re-sends the code over the same target and needs no new proof.
5. **The access token never enters a URL.** The subscription address and the
   `ntfy://<host>/<topic>` deep link of WP-M14-33 stay credential-free.

## Alternatives

- **A separate `ntfy_token` column or config key.** Rejected: §11.2 already
  defines one write-only `secret` per channel and ADR-0005 already keeps it out
  of every answer; a second store would double the secret handling and the audit
  surface for one channel.
- **The `?token=` query parameter.** Rejected: it travels in access logs, in the
  browser history and in the QR payload of the subscription — the ntfy
  documentation warns about exactly this.
- **A per-user ntfy token.** Deferred: the topic of a user is derived from the
  user id (§11.3) and published by the instance, so one instance-wide key covers
  every topic of that server; a per-user key would need the account secret of
  §11.3 and a flow that no channel has yet.

## Consequences

- A self-hosted ntfy server with access control works from the administration
  without a deployment change.
- The error texts of §11.12 have to distinguish a refused publication (403) from
  a missing or wrong key — see WP-M14-52.
- The secret handling of areas A and B of the security audit gains one more
  carrier: `ChannelConfiguration.token` is internal and schema-stripped.
