# WP-M5-11: comment composer facelift and readable history entries

format: small-model
status: done
depends-on: WP-M5-10
phase: 5
milestone: m5
context-budget: 18k tokens
spec: PLAN.md §10 (internal comments in the event history)
spec-lines: 20

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — comment composer and history list
- packages/shared/src/schemas/ticket.ts — `events[].payload` shape
- apps/web/src/i18n/locales/de/ticket.json and `en/ticket.json`

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- work-packages/m5/11-comment-facelift.md (this file)

interfaces:

- `handleAction()` returns `true` on a delivered write, so the comment composer can show a short success notice.
- comment events render their `payload.text` in the history; event reasons render as a muted line.

## Task

1. Composer: card header with icon and hint, larger textarea with placeholder,
   `maxLength={2000}` and a character counter, primary button with icon,
   `Ctrl/⌘ + Enter` submits.
2. Feedback: dismissible error alert stays directly below the header; a success
   notice `detail.comment.saved` appears for four seconds after a delivered comment.
3. History: show `payload.text` for `comment` events as a highlighted block,
   `payload.reason` for other events as a muted line, so comments are actually
   readable instead of only "Kommentiert".
4. i18n: `detail.errors.dismiss` and the `detail.comment.*` keys in de/en.

## Non-goals

- No API change and no new history endpoint; `payload` is already delivered.
- No editing or deleting of comments.
- No change to the offline queue.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: `handleAction(): Promise<boolean>`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors, 7 pre-existing warnings), `npm run test:run` (469 passed, 445 integration tests skipped without a database), `npm run i18n:check` (1062/1062), `npm run wp:check` (324 checked, 0 failed), `npm run build -w @stoerdesk/web`
- Follow-up WP: none
- Open question: none
