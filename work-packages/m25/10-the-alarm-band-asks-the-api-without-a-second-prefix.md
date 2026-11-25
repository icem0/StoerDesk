# WP-M25-10: the alarm band asks the API without a second prefix

format: ctx-256k
status: done
depends-on: WP-M25-06 (the band of the alarm in the shell), WP-M30-04 (the inbox shows the tasks)
phase: 25
milestone: m25
context-budget: 20k tokens
spec: specs/10-notifications.md §11.17 (the alarm of the instance, ADR-0048)
spec-lines: 30
changed-lines: 60

files-read:

- apps/web/src/components/alarm-banner.tsx — the band of the alarm
- apps/web/src/lib/api.ts — `apiFetch` and the base of the API
- apps/web/src/components/notification-bell.tsx — the bell of the shell, the same query
- apps/web/src/components/__tests__/alarm-banner.test.tsx — the test of the band

files-write:

- apps/web/src/components/alarm-banner.tsx — the three paths of the queries
- apps/web/src/components/__tests__/alarm-banner.test.tsx — the assertion of the paths
- work-packages/m25/10-the-alarm-band-asks-the-api-without-a-second-prefix.md — this file

interfaces:

- `GET <api-base>/v1/notifications/items/unread-count` — the number of the tasks
  of the user, asked by the band
- `GET <api-base>/v1/notifications/alarm` — the alarm of the installation
- `GET <api-base>/v1/notifications/mute` — the silence of the user

## Task

The band of the alarm asked the API with the prefix of the base **twice**.

`apiFetch` builds the address of a request as `${baseUrl}${path}` and the base
is `/api` by default (`apps/web/src/lib/api.ts`). The three queries of the band
wrote their path with the prefix of the base already — `/api/v1/notifications/…`
— so the request went to `/api/api/v1/notifications/…` and the API answered
`404`:

- the number of the tasks stayed `0`, so the band **never appeared** at all,
- the alarm of the installation stayed `toneEnabled: false`, so the tone of the
  browser never played,
- the silence of the user was never read, so the button „1 Stunde stumm" had no
  state.

The bell of the shell asks the same number with the path **without** the
prefix (`apps/web/src/components/notification-bell.tsx`) and works — the two
components read the same query under the same key.

1. `apps/web/src/components/alarm-banner.tsx`: the three paths lose the prefix
   of the base — `/v1/notifications/items/unread-count`,
   `/v1/notifications/alarm` and `/v1/notifications/mute`.
2. `apps/web/src/components/__tests__/alarm-banner.test.tsx`: the test asserts
   the **exact** address of the request (the base of `apiFetch` plus the path),
   so a second prefix cannot come back unnoticed. The stub of the test matched
   the path with `endsWith` — a doubled prefix ends with the same path and
   passed.
3. `work-packages/m25/10-the-alarm-band-asks-the-api-without-a-second-prefix.md`:
   this file.

## Non-goals

- No change of the routes of the API, of the database or of the channels.
- No change of the texts of the band and no new text.
- No change of the bell of the shell — its path is already right.
- No change of the alarm of a failed delivery (ADR-0052) — a work package of
  its own.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new assertion fails before the change and passes
after it.

## Handoff

- Files changed: `apps/web/src/components/alarm-banner.tsx`,
  `apps/web/src/components/__tests__/alarm-banner.test.tsx`
- Interfaces added: none — the routes of the API stay as they are, only the
  address of the request of the band changes
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none
- Open question: none
