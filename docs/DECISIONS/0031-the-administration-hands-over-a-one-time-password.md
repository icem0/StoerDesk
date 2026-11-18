# ADR-0031: The administration hands over a one-time password

- Status: accepted
- Date: 2026-11-18
- Stakeholders: office, administration

## Context

A new colleague needs an account in StörDesk. The office does not want to invent
a password for a colleague and to hand it over on paper or in a chat, and the
colleague should not keep a secret that the office knows. The instance has no
mail for the internal users (SMTP is only a fallback of the notification
channels), so a reset by e-mail is not available either.

## Decision

1. **The server generates the password.** The administration sets the password
   of a user (`POST /api/v1/users/:id/password`, `user.write`); the server
   answers the one-time password in plaintext exactly once
   (`{ temporaryPassword }`). The plaintext is never stored, never logged and
   never answered a second time — the rule of the write-only secrets of
   ADR-0005.
2. **The one-time password is a flag on the account.**
   `users.must_change_password` marks the account: it may log in, but every
   guarded route answers `403 { code: 'password_change_required' }` until the
   user sets a password of their own. The colleague therefore replaces the
   handed-over secret at the first login, and the office never learns it.
3. **The own password goes through the existing profile route.**
   `PATCH /api/v1/users/me` with a `password` writes the password and clears
   the flag. The route and `GET /api/v1/me` are the only two routes that stay
   reachable while the flag is set.
4. **The sessions die with the secret.** The reset deletes every session of the
   target user, the own change deletes every session except the current one.

## Alternatives

- **The administration types the password by hand.** Rejected: the plaintext
  travels through chat, paper and the hands of the office, and the colleague
  keeps a secret that two people know.
- **A password reset by e-mail with a one-time link.** Rejected: the instance
  sends no internal mail (SMTP is a notification fallback, `specs/10-notifications.md`
  §11.1), the link needs a token with an expiry and a second store, and the
  handover would leave the instance.
- **A one-time password without a forced change.** Rejected: the account would
  stay usable with a secret that was handed over and that the office knows.
- **A separate table of the pending password changes.** Rejected: the flag on
  the account is the whole state — one boolean answers whether the app may be
  used, and no row can outlive the account.

## Consequences

- The administration hands over a secret it does not know; the colleague chooses
  his own.
- The session reads the flag per request, so a reset takes effect on the next
  request and needs no new login (§3.2).
- The block is a rule of the guards, not a rule of the client: an API call
  without the own password answers `403 password_change_required`.
- The plaintext of the one-time password exists in the answer of the reset, in
  the clipboard of the browser of the administration and in the head of the
  colleague — it is never written into a log line, a database row or a ticket.
