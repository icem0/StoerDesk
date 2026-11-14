# WP-M14-57: The copied ntfy curl is one shell command

format: small-model
status: done
depends-on: WP-M14-52, WP-M14-56
phase: 14
milestone: m14
context-budget: 6k tokens
spec: specs/10-notifications.md §11.11, §11.14
spec-lines: 8

files-read:

- apps/web/src/admin/channels-page.tsx (`buildNtfyCurl`)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the curl assertions)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/admin/__tests__/channels-page.test.tsx
- work-packages/m14/57-the-ntfy-curl-is-one-command.md

interfaces:

- `buildNtfyCurl(url, topic, secretSet)` returns one command with `\` continuation on every line but the last

## Task

The Authorization line was inserted after a line that already ended in its own
continuation, so the first line had no `\` and the shell stopped there. The
copied command could never run, whatever the variable held.

1. `buildNtfyCurl` joins its lines with ` \` ; the Authorization line is optional.
2. The page test asserts that every line but the last ends with ` \`.

## Non-goals

- The stored key stays out of the command (ADR-0022): the variable `$NTFY_TOKEN`
  has to be set in the terminal by the operator.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

## Handoff

- Files changed: the page, its test, this document.
- Interfaces added: none.
- Verified: channels page tests 12/12; generated command passes `bash -n`.
- Follow-up WP: none.
- Open question: none.
