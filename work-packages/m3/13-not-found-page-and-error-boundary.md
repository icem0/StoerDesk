# WP-M3-13: the not found page and the error boundary of the router

format: small-model
status: implemented
depends-on: WP-M3-12
phase: 3
milestone: m3
context-budget: 16k tokens
spec: specs/13-ui.md §13.1
spec-lines: 40

files-read:

- apps/web/src/routes/index.tsx — the route table of the application
- apps/web/src/components/Shell.tsx — the shell of the guarded pages
- apps/web/src/auth/require-session.tsx — the guard of the guarded pages
- apps/web/src/i18n/locales/de/common.json — the texts of the shell
- apps/web/src/features/dashboard/start-page.tsx — the page of the dashboard
- PLAN.md §14

files-write:

- apps/web/src/components/not-found-page.tsx
- apps/web/src/components/route-error-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/common.json

interfaces:

- `routes` — the route table, exported next to the router
- `NotFoundPage` — the page of an unknown address
- `RouteErrorPage` — the error element of the router

## Task

The retired page `/admin/update` is a dead address, and every other unknown
address ends in the developer page of React Router ("Unexpected Application
Error! 404 Not Found"). That is no answer for a user of the administration.

1. Add `apps/web/src/components/not-found-page.tsx`: the page of an unknown
   address with a heading, a hint and a link to the dashboard.
2. Add `apps/web/src/components/route-error-page.tsx`: the error element of the
   router. It replaces the developer page, names the reason (a missing address
   or a failure) and brings its own frame, because the error element replaces
   the shell of the application.
3. `apps/web/src/routes/index.tsx`: export the route table next to the router,
   add the catch-all route of the not found page as the last child of the shell
   and the `errorElement` of the root route. The retired `/admin/update` leads
   to the administration home, so an old bookmark lands somewhere useful.
4. The texts in the `common` namespace of `de` and `en`.
5. The tests: an unknown address shows the not found page, the retired address
   leads to the administration home, a failing route shows the error page.

## Non-goals

- No change of the report form or of the status page: the public routes stay
  outside the shell and are more specific than the catch-all.
- No server-side 404: the web app is a single page application, the API has its
  own error envelope (§3).

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run test:run -w @stoerdesk/web
npm run check
```

Expected: all green; the route test proves the not found page and the
redirection of the retired address.

## Handoff

- Files changed: `apps/web/src/components/not-found-page.tsx` (new),
  `apps/web/src/components/route-error-page.tsx` (new),
  `apps/web/src/components/__tests__/route-error-page.test.tsx` (new),
  `apps/web/src/routes/index.tsx`,
  `apps/web/src/routes/__tests__/index.test.tsx` (new),
  `apps/web/src/i18n/locales/de/common.json`,
  `apps/web/src/i18n/locales/en/common.json`, `docs/REPO-MAP.md`, `CHANGELOG.md`
- Interfaces added: `routes`, `NotFoundPage`, `RouteErrorPage`
- Verified: `npm run check` (63 files, 386 tests, i18n and wp-check green); the
  route test proves the not found page and the redirection of the retired
  address, the error test proves that the developer page of React Router is
  replaced
- Follow-up WP: none
- Open question: none
