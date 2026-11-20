# WP-M15-09: the channel card explains a failure with the texts of its channel

format: small-model
status: done
depends-on: WP-M15-08
phase: 15
milestone: m15
context-budget: 16k tokens
spec: specs/10-notifications.md §11.12
spec-lines: 16

files-read:

- apps/web/src/admin/channels-page.tsx (`makeReasonOf` and its call sites)
- apps/web/src/admin/delivery-page.tsx (the lookup of the neutral texts, WP-M14-161d)
- apps/web/src/i18n/locales/de/settings.json (`admin.channels.errors`, `admin.delivery.reasons`)
- apps/web/src/i18n/locales/en/settings.json (the English counterpart)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the page test)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/i18n/locales/de/settings.json,
  apps/web/src/i18n/locales/en/settings.json (the texts of the lookup)
- apps/web/src/admin/__tests__/channels-page.test.tsx, specs/10-notifications.md,
  CHANGELOG.md, docs/REPO-MAP.md, work-packages/README.md, this document

interfaces:

- `reasonOf(code, kind)` on the channel page: the channel decides the texts
- the neutral texts `admin.delivery.reasons.channel_not_configured` and
  `admin.channels.errors.channel_error` in `de` and `en`
- the duplicated push texts of WP-M15-08 are removed from
  `admin.channels.errors` — `admin.delivery.reasons` carries them for both pages

## Task

**The fault of the office (out of band in phase 15).** The card of the web push
explained a failing test send with an ntfy sentence, and the card of Matrix would
explain a `407` with "the topic is already taken". The page had one text
namespace for all channels (`admin.channels.errors`), whose texts name the topic,
the token and the server of **ntfy** (`PLAN.md` §16, WP-M14-161d) — the fallback
`http_error` interpolated any machine code into that ntfy sentence.

1. `makeReasonOf` in `apps/web/src/admin/channels-page.tsx` takes the channel
   kind. For `ntfy` the texts of the channel administration stay as they are
   (they are written for it, and its fallback names the server answer). For
   every other channel the neutral texts of the delivery page speak
   (`admin.delivery.reasons.<kind>.<code>`, then `admin.delivery.reasons.<code>`);
   a code without a text falls back to `admin.channels.errors.channel_error`,
   which names the machine code and points to the log of the API and to the
   delivery page. No channel other than ntfy can reach an ntfy sentence again.
2. `de` and `en` gain `admin.delivery.reasons.channel_not_configured` (a
   channel without a target is a failure of the configuration, not of ntfy) and
   `admin.channels.errors.channel_error` (the neutral fallback with `{{code}}`).
   The six push texts of WP-M15-08 are dropped from `admin.channels.errors`:
   they duplicate the texts of `admin.delivery.reasons`, which both pages share.
3. The page test drives every card with its own kind: the ntfy card keeps the
   ntfy texts, the web push card names the cause of `push_unreachable` and the
   Matrix card explains `http_407` without naming a topic.

## Non-goals

- No change of `delivery-page.tsx` and of its lookup (already the neutral one).
- No change of the adapters, of `failureCode` or of any route.
- No new machine code.

## Acceptance

```bash
npm run i18n:check
npm run test:run apps/web/src/admin/__tests__/channels-page.test.tsx
npm run check
```

Expected: green; the cards name their own channel.

## Handoff

- Files changed: the page, the two locale files, the page test, the spec, the
  repository bookkeeping
- Interfaces added: `reasonOf(code, kind)` and the neutral texts above
- Verified: `npm run i18n:check`, the page test, `npm run check`
- Follow-up WP: WP-M15-10 — the web push test send never says "sent" while no
  device is subscribed
- Open question: none
