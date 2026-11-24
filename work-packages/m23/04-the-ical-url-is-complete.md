# WP-M23-04: the iCal URL is complete and visible

format: small-model
status: done
depends-on: WP-M23-01
phase: 23
milestone: m23
context-budget: 18k tokens
spec: specs/04-oncall.md §4a.7
spec-lines: 20

files-read:

- apps/web/src/lib/api.ts (the base URL of the API)
- apps/web/src/features/oncall/readiness-calendar.tsx (the frame with the share button)
- apps/web/src/features/oncall/my-shifts-page.tsx (the page that reads the iCal URL)
- packages/shared/src/schemas/oncall.ts (the contract of the iCal URL)
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx (the test of the frame)

files-write:

- apps/web/src/lib/api.ts, apps/web/src/features/oncall/readiness-calendar.tsx
- apps/web/src/i18n/locales/de/oncall.json, apps/web/src/i18n/locales/en/oncall.json
- apps/web/src/features/oncall/__tests__/readiness-calendar.test.tsx
- work-packages/m23/04-the-ical-url-is-complete.md, work-packages/README.md, PLAN.md

interfaces:

- `absoluteApiUrl(path: string): string` — the path of the API, resolved against the
  origin of the API; the calendar app receives a complete address
- `ReadinessCalendar({ shifts, pools, showNames?, icalUrl? })` — the frame shows the
  share button; a click copies the complete URL and opens a panel that names it

## Task

1. The API answers the iCal feed as a path (`/api/v1/oncall/ical/<token>.ics`,
   `packages/shared/src/schemas/oncall.ts:303`) — the contract of WP-M8-14b. The
   web app never resolved it, so the share button copied a path without host and
   scheme: in a calendar app the link was worthless.
2. `apps/web/src/lib/api.ts` gains `absoluteApiUrl(path)`: the origin of the API
   (the origin of `VITE_API_BASE_URL`, or the origin of the page when the base is
   relative) plus the path of the answer. The path already carries the public
   prefix `/api/`, so the origin is the only part the client adds.
3. The frame of the calendar resolves the URL itself and copies the complete
   address. A click opens a panel below the head of the frame: the title, the
   address in a read-only field, a second copy button and the hint that the
   address goes into the calendar app. The panel is the visible proof that the
   link is complete.
4. Name the texts in `de` and `en`.

## Non-goals

- No change of the API, of the token or of the feed itself.
- No change of the subscription of the personal feed — the URL is the same.
- No new section below the calendar; the panel belongs to the frame.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new tests fail before the change and pass after it.

## Handoff

- Files changed: the helper of the API base, the frame of the calendar, the
  locales, the test of the frame and the work packages of phase 23
- Interfaces added: `absoluteApiUrl`
- Verified: the commands above
- Follow-up WP: none
- Open question: none
