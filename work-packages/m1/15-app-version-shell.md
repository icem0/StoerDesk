# WP-M1-15: app version visible in the web shell

format: small-model
status: done
depends-on: WP-M1-13
phase: 1
context-budget: 12k tokens
spec: PLAN.md §16
spec-lines: 20

files-read:

- apps/web/src/components/Shell.tsx
- apps/web/vite.config.ts
- apps/web/src/i18n/locales/de/common.json
- Dockerfile

files-write:

- apps/web/src/lib/version.ts
- apps/web/src/components/app-version.tsx
- apps/web/src/components/Shell.tsx
- apps/web/vite.config.ts

interfaces:

- `appVersion: string` — build version from `__APP_VERSION__`, fallback `dev`
- `AppVersion({ version?, className? }): JSX.Element`

## Task

WP-M1-13 replaced the old `App.tsx` shell and dropped the version line that commit
3e1c0f8 had added. The version is already passed into the web build as
`VITE_APP_VERSION` (Dockerfile, compose, CI); make it visible everywhere again.

1. Resolve the version in `vite.config.ts`: use a non-`dev` `VITE_APP_VERSION`,
   otherwise the nearest git tag (`git describe --tags --abbrev=0`), otherwise `dev`.
   Inject it as the compile-time constant `__APP_VERSION__`.
2. Add `apps/web/src/lib/version.ts` exporting `appVersion` from that constant.
3. Add `AppVersion` in `apps/web/src/components/app-version.tsx`; it renders the
   existing `common:app.version` label next to the value and accepts an optional
   `version` prop for tests.
4. Render `AppVersion` in the sticky header of `Shell.tsx` outside the signed-in
   branch, so it is visible on the login screen and on every guarded page.
5. Cover the component with a test that asserts the injected version and the label.

## Non-goals

- No API version endpoint and no API changes.
- No language switcher and no new i18n keys.
- No change to the image tags or the CI run naming.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the component exists and passes after.

## Handoff

- Files changed: `vite.config.ts`, `lib/version.ts`, `components/app-version.tsx`,
  `components/Shell.tsx`, one component test, one login-screen assertion in the smoke E2E.
- Interfaces added: `appVersion`, `AppVersion`.
- Verified: `npm run check` (typecheck, lint, unit tests, i18n, WP check) and the smoke E2E
  against a real database with `E2E_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`.
- Follow-up WP: none.
- Open question: none — local development shows the nearest git tag, a Docker/CI
  build shows the `VITE_APP_VERSION` build argument.
