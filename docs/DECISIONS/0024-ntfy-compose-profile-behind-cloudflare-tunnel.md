# ADR-0024: ntfy as an optional Compose profile behind a Cloudflare Tunnel

- Status: accepted
- Date: 2026-11-15
- Stakeholders: administration, office, operators of the instance

## Context

ADR-0019 and `docs/DEPLOYMENT.md` assume that every notification server already
exists and StörDesk ships none. In practice the operators asked for a ready
ntfy server: the self-hosted server has to be set up with an access control
list (ntfy `auth-default-access: deny-all`, a read-only anonymous entry for
`stoerdesk-*`, one API user with a read-write entry and a token), and the phones
need the server over HTTPS to subscribe through a QR code. Doing this by hand on
a host the operator does not control is the main obstacle.

The public address of the server must not be opened by a port forward. The
operators run Cloudflare for the domain, so a Cloudflare Tunnel (`cloudflared`)
can publish the server without an open inbound port and with a certificate
managed by Cloudflare.

## Decision

1. **ntfy is an optional Compose profile `ntfy`** of `docker-compose.yml`, the
   same mechanism as the profile `backup`. The core stack (`db`, `api`, `web`)
   is unchanged; without the profile nothing is started and the external
   instance keeps working as before.
2. **The ntfy configuration is a file of the repository** (`ntfy/server.yml`).
   It sets `auth-file`, `auth-default-access: deny-all`, `base-url` from the
   environment, and the behind-proxy settings (below). Secrets are never in the
   file; they come from `.env`.
3. **The access control list is created by a setup script**, not by hand. The
   script creates the user `stoerdesk-api` (role `user`), the entry
   `stoerdesk-api:stoerdesk-*:rw`, the anonymous entry `everyone:stoerdesk-*:ro`
   and one access token. The token is written to `.env` as `NTFY_TOKEN` and is
   never printed in a log. Running the script again changes nothing that exists.
4. **Public access only through a Cloudflare Tunnel profile `tunnel`**
   (`cloudflared`, token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`). The ntfy
   container publishes no host port. The tunnel's public hostname points to
   `http://ntfy:80` on the `backend` network; the hostname is `NTFY_HOSTNAME`
   in `.env`.
5. **Behind the tunnel the visitor address is the Cloudflare header.** ntfy is
   started with `behind-proxy: true` and `proxy-forwarded-header:
   CF-Connecting-IP`, otherwise all phones share the rate-limit bucket of the
   tunnel.
6. **The subscription QR code carries the topic, not a credential.** The topic
   of a channel is a random name of at least 128 bits (`stoerdesk-<random>`),
   stored in `notification_accounts.external_id`; it is derived no longer from
   the user id. The anonymous read entry lets a phone subscribe with the QR code
   and no login. Anyone who knows the topic name can read it, and ntfy never
   lists topics. The topic is therefore a secret and is handled as one: never
   logged, never shown outside the subscription QR of the owning user.
7. **StörDesk keeps the external ntfy path.** `NTFY_URL` and `NTFY_PUBLIC_URL`
   still point to any ntfy server; the profile is a convenience, not a
   replacement of the external configuration.

## Alternatives

- **Compose service without a profile.** Rejected: every installation would
  start a notification server it may not need, and the tunnel would be
  mandatory.
- **A port forward instead of the tunnel.** Rejected: it opens an inbound port
  on the host and makes certificate handling the operator's task.
- **Login in the ntfy app for every phone.** Rejected: the QR code must work
  without typing a password, which is the purpose of this change.
- **A public ntfy.sh topic.** Rejected: messages would leave the operator's
  control and the topic name is then the only protection.

## Consequences

- `docs/DEPLOYMENT.md` changes its statement "StörDesk ships no notification
  servers": the ntfy profile is the exception, and the other channels stay
  external.
- The backup profile has to include the ntfy volumes (`/var/lib/ntfy`) once the
  profile is used; WP-M14-72 covers it.
- The token of the API user is a secret of the deployment, the same class as
  `POSTGRES_PASSWORD`; it is written only to `.env`.
- The random topic names of existing users change; the QR codes of the settings
  page are regenerated from the new name, the old topics are abandoned.
- Work packages WP-M14-69, WP-M14-70, WP-M14-71 and WP-M14-72 implement this ADR.
