# WP-M1-22: the app version reads version tags only

format: small-model
status: done
depends-on: WP-M1-16, WP-M1-21
phase: 1
context-budget: 12k tokens
spec: PLAN.md §18.3 (version of record), §4 (the version of the application), §3 (language), specs/06-report-form.md is not affected
spec-lines: 20

files-read:

- apps/web/app-version.mjs (the version resolution of the shell)
- apps/web/src/lib/__tests__/app-version.test.ts (the fixture of the version resolution)
- scripts/version-file.mjs (the version of the tracked `VERSION` file)
- PLAN.md

files-write:

- apps/web/app-version.mjs with apps/web/app-version.d.mts and apps/web/src/lib/__tests__/app-version.test.ts
- scripts/version-file.mjs (one German comment becomes English)

interfaces:

- `gitVersion(cwd = process.cwd())` — the nearest **version** tag (`git describe --tags
  --abbrev=0 --match 'v[0-9]*'`); a moving pointer tag such as `latest` is not a version
  and is ignored
- `resolveAppVersion(configured, { getGitVersion, versionFileDirs })` — unchanged: the
  explicit build argument wins, then the `VERSION` file, then the version tag

## Task

The check run of the release `v0.1.0` was red: the fixture
`apps/web/src/lib/__tests__/app-version.test.ts` answered `expected 'latest' to match
/^v\d+\.\d+\.\d+/`. The fallback of the app version reads the nearest tag with
`git describe --tags --abbrev=0`, and a moving pointer tag (`latest`) is an annotated
tag on the same commit — `git describe` prefers it over the version tag. The version of
the shell would have shown `latest` as well, and the gate failed for every release that
carries such a tag.

1. `apps/web/app-version.mjs`: `gitVersion()` describes the version tags only
   (`--match 'v[0-9]*'`); a pointer tag is never a version of the application.
2. `apps/web/app-version.mjs`: `gitVersion()` takes an optional working directory, so the
   fixture can build a throwaway repository instead of reading the checkout of the test.
   `apps/web/app-version.d.mts` declares the new parameter.
3. `apps/web/src/lib/__tests__/app-version.test.ts`: a new case builds a repository with
   the version tag `v1.2.3` and the pointer tag `latest` and expects `v1.2.3`.
4. `scripts/version-file.mjs`: the comment that `STOERDESK_VERSION` overrides the derived
   patch release is English again (`PLAN.md` §3, §4.1).

## Non-goals

- No change to the `VERSION` file, to the hooks or to the version tags of the images.
- No change to `normalizeAppVersion`: an explicit build argument may still be `latest`.
- No change to the release tooling of the CI workflows.

## Acceptance

```bash
npm run check
npm run wp:check
```

Expected: green; the new case fails before the change (with the pointer tag in the
checkout) and passes after it.

## Handoff

- Files changed: `apps/web/app-version.mjs`, `apps/web/app-version.d.mts`,
  `apps/web/src/lib/__tests__/app-version.test.ts`, `scripts/version-file.mjs`,
  `work-packages/m1/22-app-version-version-tags.md` and the bookkeeping outside
  `files-write` (`CHANGELOG.md`, `PLAN.md` §16, `docs/REPO-MAP.md`,
  `work-packages/README.md`)
- Interfaces added: `gitVersion(cwd?)` reads the nearest version tag
- Verified: `npm run check` green — typecheck (3 workspaces), `eslint .` (0 errors, the
  one pre-existing `photo-upload.tsx` fast-refresh warning), `vitest run` against the
  reachable PostgreSQL of `TEST_DATABASE_URL`, `i18n:check`, `wp:check` and
  `npm run test:e2e` green with `E2E_CHROMIUM_PATH=/usr/bin/chromium`; the red run
  `41439608365` (v0.1.0) was read and its annotation named the failing fixture
- Follow-up WP: none
- Open question: none
