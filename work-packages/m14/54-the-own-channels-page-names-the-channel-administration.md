# WP-M14-54: The own channels page names the administration of the channels

format: small-model
status: done
depends-on: WP-M14-10, WP-M14-17, WP-M14-48
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/10-notifications.md §11.1, §11.4, §11.12 (ADR-0019)
spec-lines: 20

files-read:

- specs/10-notifications.md §11.1, §11.4, §11.12
- PLAN.md §14 (both pages are entries of the settings menu)
- apps/web/src/settings/notifications-page.tsx (the own channels page of WP-M14-10)
- apps/web/src/admin/channels-page.tsx (the symmetric `personalLink` of WP-M14-48)
- apps/web/src/i18n/locales/de/common.json (`notifications.*` keys)
- apps/web/src/settings/__tests__/notifications-page.test.tsx (the page test pattern)

files-write:

- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/{de,en}/common.json
- apps/web/src/settings/__tests__/notifications-page.test.tsx
- specs/10-notifications.md (§11.12), work-packages/m14/54-the-own-channels-page-names-the-channel-administration.md

interfaces:

- one `Link` to `/admin/channels` on the own channels page under the header hint
- the ntfy fallback block names `/admin/channels` as the place that configures the channel
- i18n keys `notifications.administration.link` and `notifications.administration.hint` (`de`, `en`)

## Task

The office asked where the channels behind the own channels page are set: the page
reads `GET /v1/admin/channels` but only offers a back link to `/settings`, while
the administration already links to this page (`admin.channels.verification.personalLink`,
WP-M14-48). The link stays one page per direction — the two pages keep their layers
(`notification.write` configuration vs. the session accounts of §11.3/§11.4).

1. `notifications-page.tsx`: under the header hint render one `Link` to
   `/admin/channels` with the label `notifications.administration.link`; the
   link is text only, it carries no permission check and no extra fetch.
2. In the ntfy fallback branch (no QR because the instance has no target) the
   section names the destination as a second line with the same link.
3. `de` and `en` `common.json` gain `notifications.administration.link`
   (`Kanal-Administration (Administration → Channels)` / `Channel administration
   (Administration → Channels)`) and `notifications.administration.hint`
   (the sentence that the configuration of the channels itself, the write-only
   secrets and the test message live there).
4. The page test asserts one link with `href="/admin/channels"` under the header
   in the default state and the translated label.

## Non-goals

- No merge of the two pages: the administration keeps the secrets, the test send
  and the minimum channels behind `notification.write` (PLAN.md §17 layer rule).
- No API, route, schema or permission change.
- No change of `apps/web/src/admin/channels-page.tsx` — its link exists already.
- No readiness or minimum-channel entry on the own page (WP-M14-32 stays planned).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; the new assertion fails before the change, because the
own page carried no link to the administration.

## Handoff

- Files changed: `notifications-page.tsx`, `de`/`en` `common.json`, the page test,
  `specs/10-notifications.md` §11.12 and this WP document.
- Interfaces added: the two i18n keys and the `Link` to `/admin/channels`.
- Verified: `npm run check` green (typecheck, ESLint, vitest, i18n:check, wp:check,
  e2e-check); the new page test asserts both links and the translated label.
- Follow-up WP: none.
- Open question: none.
