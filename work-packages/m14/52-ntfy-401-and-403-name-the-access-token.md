# WP-M14-52: ntfy 401 and 403 name the access token

format: small-model
status: planned
depends-on: WP-M14-49, WP-M14-50, WP-M14-51
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/10-notifications.md §11.2, §11.12, §11.13
spec-lines: 25

files-read:

- apps/web/src/admin/channels-page.tsx (test result, curl command)
- apps/web/src/i18n/locales/de/settings.json (admin.channels.errors)
- apps/web/src/i18n/locales/en/settings.json (admin.channels.errors)
- specs/10-notifications.md §11.2, §11.13

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/__tests__/channels-page.test.tsx
- apps/web/src/i18n/locales/{de,en}/settings.json
- work-packages/m14/52-ntfy-401-and-403-name-the-access-token.md

interfaces:

- `admin.channels.errors.http_401` and `http_403` name the access token as the
  first cause
- the copied curl carries `-H "Authorization: Bearer $NTFY_TOKEN"` while the row
  has a secret
- `admin.channels.verification.tokenHint` names the write-only secret field

## Task

The office saved the API key of its ntfy server in the secret field of the
channel card, the test send answered `403` — and the administration said
"the topic belongs to someone else". A key that is stored but never sent or an
unreachable server is the most common cause of that code.

1. `admin.channels.errors.http_401` and `http_403` (de/en) name the access token
   first: no or wrong key in the secret field of this channel, the topic being
   claimed by someone else only as the second cause.
2. `admin.channels.errors.http_429` and `http_402` keep their meaning, the rate
   limit hint stays.
3. The ntfy card shows one hint line (`admin.channels.verification.tokenHint`)
   while `secretSet` is false and the channel is enabled: the server may need an
   access token in the secret field.
4. `buildNtfyCurl` adds the `-H "Authorization: Bearer $NTFY_TOKEN"` line while
   `secretSet` is true — the shell variable, never the stored key (ADR-0005,
   ADR-0022); the hint names the field the key has to be in.
5. A regression test asserts the curl header line and the translated 403 text.

## Non-goals

- No API change, no new error code.
- No secret value in any text, answer or clipboard content.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: `apps/web/src/admin/channels-page.tsx`, the de/en `settings.json`,
  the page test.
- Interfaces added: the three keys above in `de` and `en`.
- Verified: —
- Follow-up WP: none
- Open question: none
