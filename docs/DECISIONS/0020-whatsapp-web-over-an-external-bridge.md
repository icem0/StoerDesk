# ADR-0020: WhatsApp Web over an external bridge

- Status: accepted
- Date: 2026-11-12
- Stakeholders: administration, office, on-call technicians

## Context

WhatsApp Web is wanted as a notification channel next to ntfy, Telegram and
Matrix. WhatsApp has no official messaging interface for personal accounts: a
sender needs a linked device session, which the unofficial clients obtain with
a QR pairing and keep in a session file.

Two consequences follow. The session is a login credential of a person, and it
expires. A client that keeps it needs a browser (whatsapp-web.js runs Chromium)
or a Node WebSocket stack (Baileys) and a long-lived volume for the session.

`PLAN.md` §4 decides that StörDesk ships no messenger container and that the
notifications go to external systems only. The compose stack of StörDesk has no
browser and no WhatsApp session, and the personal data protection (§15) does
not want a credential of a member of staff in the volume of the application.

## Decision

1. **WhatsApp Web is an external bridge.** StörDesk speaks a small HTTP
   contract to a bridge that the operator runs:
   - `POST {baseUrl}/messages` with `{ chatId, text }` and the bearer of the
     bridge; `202` means accepted, every other answer is a failure of the
     channel.
   - `GET {baseUrl}/status` answers `{ connected: boolean, chats: [{ id, label }] }`.
2. **The bridge owns the session and the pairing.** The QR pairing happens in
   the bridge, never in StörDesk. StörDesk shows the status of the bridge and
   the chats it offers.
3. **The compose stack of StörDesk gains no service.** The bridge URL and its
   bearer live in the configuration of the channel (ADR-0019), the chat id of a
   user lives in the account of the user. A missing bridge means: the channel
   is not configured.
4. **The channel is off by default** and takes part in the fallback chain only
   when it is configured and enabled.

## Alternatives

- **A WhatsApp Web client inside the stack** (whatsapp-web.js with Chromium or
  Baileys in the API container). Rejected: a personal login session in the
  volume of the application, a second image of hundreds of megabytes, a session
  that expires and must be re-paired, and a direct violation of the rule of
  §4 that StörDesk ships no messenger.
- **The official WhatsApp Business Cloud API.** Rejected as *this* channel: it
  needs a business account, approved message templates and a customer service
  window of 24 hours — it fits a customer service, not an internal fault desk
  that writes to personal numbers. It can be added later as a channel of its
  own; the contract of the bridge leaves that door open.
- **A webhook of the bridge into StörDesk for the replies.** Deferred: the
  channel writes notifications, it does not read conversations. A later phase
  can add the replies over the same bridge contract.

## Consequences

- The operator runs a bridge next to the other external services of the
  instance; the deployment documentation names the contract and the two calls.
- The channel can fail like every other channel: the failure is logged, the
  event `notification_failed` is written and the chain continues with the next
  channel.
- The pairing of an account is a step of the operator and not of the user —
  the settings page shows the chats of the bridge and the user picks one.
- StörDesk never stores a WhatsApp session, only the id of a chat.
