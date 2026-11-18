# WP-M14-130c: the daily check warns over another channel

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.15; PLAN.md §12; ADR-0028
spec-lines: 20

depends-on: WP-M14-130a, WP-M14-130b, WP-M14-19

files-read:

- apps/api/src/notifications/outbox.ts (the drain, the fallback and `messageOf`)
- apps/api/src/dashboard/service.ts (`resolveChannelStatus` — the status per channel)
- apps/api/src/jobs/qr-cleanup.ts (the daily job of the repository)
- packages/shared/src/i18n/server.de.json (the texts of the server)

files-write:

- apps/api/src/notifications/health.ts
- apps/api/src/notifications/outbox.ts
- packages/shared/src/i18n/server.de.json, packages/shared/src/i18n/server.en.json

interfaces:

- `evaluateChannelHealth(database): Promise<ChannelHealth[]>` — the broken
  channels: their last delivery failed and no delivery of them succeeded since
- `enqueueChannelHealthWarnings(database, env, now?): Promise<number>` — one row
  of the event type `channel.health_warning` per broken channel, at most one
  per channel and per day
- `warningChannelOf(database, env, brokenChannel): Promise<string>` — the first
  configured channel of the chain that is not the broken one; a confirmed ntfy
  target only, the chain of the drain
- The text `notification.channel_health_warning` (de/en) with the parameters
  `channel` and `code`

## Task

1. In `apps/api/src/notifications/health.ts`, add `evaluateChannelHealth`: it
   reads the rows of the outbox and answers the channels whose newest row is a
   failure while no success of the same channel is newer. The names, the
   counters and the machine codes only — no ticket number, no contact data.
2. Add `enqueueChannelHealthWarnings`: for every broken channel it looks for a
   warning row of the last 24 hours and writes a new one only when there is
   none. The target is the first configured channel of the chain that is not
   the broken one; a broken channel without another configured channel writes
   nothing — the badge of the administration (§11.8) stays the only warning.
3. In `apps/api/src/notifications/outbox.ts`, the message of a warning row is
   the translated text of `notification.channel_health_warning` with the name of
   the channel and the machine code of its last failure, and such a row never
   falls back to the next channel: the warning is the last word about the
   broken channel (§11.15).
4. The daily check runs once a day next to the outbox drain of the same
   pg-boss instance.
5. Add a test that proves a failed channel without a later success is named, a
   channel with a later success is not, a second run of the same day writes
   nothing and the warning row carries the broken channel and its code.

## Non-goals

- No daily test push into the browsers (ADR-0028, decision 1).
- No change of the badge of the administration (§11.8).
- No emergency number and no emergency wording in the text (`PLAN.md` §2).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; a broken channel warns once a day over another channel and
the warning text is translated.

## Handoff

- Files changed: the health module, the outbox and the two server locales
- Interfaces added: `evaluateChannelHealth`, `enqueueChannelHealthWarnings`, the
  text `notification.channel_health_warning`
- Verified: `npm run check` (exit 0), the integration spec of the health check,
  the fix of the chain of the warning (`fix(api)`, the chain of the drain)
- Follow-up WP: none
- Open question: none
