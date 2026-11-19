# WP-M14-171: a failing web push names its cause

format: small-model
status: done
depends-on: WP-M14-170
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.15
spec-lines: 24

files-read:

- apps/api/src/notifications/channels/web-push.ts (the adapter and its codes)
- apps/api/src/notifications/channels/__tests__/web-push.test.ts (the pattern)
- apps/api/src/notifications/outbox.ts (the log line of a failed send)
- apps/web/src/admin/delivery-page.tsx (the reason of a code)
- apps/web/src/i18n/locales/de/settings.json (`admin.delivery.reasons.*`)
- scripts/e2e-acceptance.mjs (item 11, the delivery side of the channel)

files-write:

- apps/api/src/notifications/channels/web-push.ts (the codes and the pair check)
- apps/web/src/i18n/locales/de/settings.json,
  apps/web/src/i18n/locales/en/settings.json (the texts of the codes)
- apps/api/src/notifications/channels/__tests__/web-push.test.ts,
  scripts/e2e-acceptance.mjs, specs/10-notifications.md, CHANGELOG.md,
  docs/REPO-MAP.md, work-packages/README.md, this document

interfaces:

- the code `vapid_key_mismatch` — the public key does not belong to the
  private key
- the codes `push_unauthorized`, `push_rejected`, `push_unreachable` — the
  cause of a failed send of the web push
- the texts `admin.delivery.reasons.push_unauthorized`,
  `.push_rejected`, `.push_unreachable`, `.vapid_key_mismatch` in `de` and `en`

## Task

**The fault of the office (out of band in phase 14).** Every failed web push
showed the same code `send_failed` on the page of the delivery problems: the
operator could not tell a rejected key from an unreachable push service from a
device that is gone.

1. `apps/api/src/notifications/channels/web-push.ts` names the cause of every
   failed send:
   - `vapid_key_mismatch` — the public key does not belong to the private key.
     The check runs before the request, so the pair is never sent to a push
     service that rejects it with `403` for every device.
   - `push_unauthorized` — the push service answered `401` or `403`.
   - `push_rejected` — the push service answered with another status.
   - `push_unreachable` — the request never got an answer. The message of the
     error names the errno of the transport (`ENOTFOUND`, `ETIMEDOUT` …), never
     the endpoint of a device and never a key.
2. The unit test proves the four codes, the errno in the message and the pair
   check — the test generates its own key pair, so no key of an instance is in
   the repository.
3. `de` and `en` gain the texts of the four codes under
   `admin.delivery.reasons`; the page of the delivery problems and the channel
   page show them beside the machine code.
4. `scripts/e2e-acceptance.mjs` generates its key pair for the delivery side of
   the channel (item 11) instead of using placeholders — the adapter checks the
   pair now.

## Non-goals

- No change of the dead subscription of §11.15: a `404` or a `410` still names
  the endpoint and removes its row.
- No change of the escalation chain and no new channel: a failing web push
  still falls back to the next channel.
- No removal of a device on `401` or `403`: a rejected authorization is a fault
  of the configuration, not of the device — the device stays and works again
  after the keys are repaired.
- No new endpoint and no new permission.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/api/src/notifications/channels/web-push.ts`, the two
  `settings.json` locale files, the unit test, `scripts/e2e-acceptance.mjs`,
  `specs/10-notifications.md` §11.15, `CHANGELOG.md`, `docs/REPO-MAP.md`,
  `work-packages/README.md`
- Interfaces added: the codes `vapid_key_mismatch`, `push_unauthorized`,
  `push_rejected`, `push_unreachable` and their texts
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`,
  `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: WP-M14-172 — the device registers itself again when the key of
  the server changed
- Open question: none
