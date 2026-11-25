# WP-M39-01: The update starts even when the versions cannot be compared

format: ctx-256k
status: done
depends-on: WP-M3-08, WP-M3-10
phase: 39
milestone: m39
context-budget: 44k tokens
spec: specs/18-self-update.md §18.2, specs/18-self-update.md §18.4; PLAN.md §16
spec-lines: 120
changed-lines: 160

files-read:

- PLAN.md §16, §17, §18
- AGENTS.md
- specs/18-self-update.md (§18.2, §18.3, §18.4)
- apps/api/src/update/routes.ts
- apps/api/src/update/github.ts
- apps/api/src/update/installed-version.ts
- apps/api/src/update/__tests__/routes.integration.spec.ts
- apps/web/src/admin/update-panel.tsx
- apps/web/src/admin/__tests__/update-panel.test.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- packages/shared/src/schemas/update.ts
- work-packages/README.md

files-write:

- apps/api/src/update/routes.ts
- apps/web/src/admin/update-panel.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/api/src/update/__tests__/routes.integration.spec.ts
- apps/web/src/admin/__tests__/update-panel.test.tsx
- specs/18-self-update.md
- PLAN.md
- CHANGELOG.md
- work-packages/README.md
- work-packages/m39/01-the-update-starts-without-a-comparison.md (this document)

interfaces:

- `POST /api/v1/admin/update/start` — refuses with `409 update_no_update_available` only when the comparison **proves** that the installation is up to date; a comparison that GitHub refuses (or an unknown installed version) no longer blocks the start
- `GET /api/v1/admin/update/check` — unchanged (`commitsBehind: null` still names the unknown state)
- `settings:admin.update.notComparableHint` — the panel names the consequence of the unknown state
- `settings:admin.update.confirmNotComparable` — the confirm step of the unknown state names the risk

## Task

The office reported: the update menu of the administration says „Die Versionen
lassen sich nicht vergleichen." and no update can be started — the panel shows
the message instead of the button, and the API refuses the start with
`409 update_no_update_available`. The comparison is refused by GitHub whenever the
installed version is not part of the upstream history: the image carries the
version tag of the `VERSION` file (`GIT_COMMIT` is `unknown` in a Compose build
without the build argument), and a tag that was never pushed upstream cannot be
compared. **The unknown state is not a proof that nothing is newer** — it only
means that the API cannot count the commits. The operator who presses the button
knows what he wants.

1. **The API (`apps/api/src/update/routes.ts`).** The start refuses only when the
   comparison proves that the installation is up to date (`commitsBehind === 0`).
   A refused comparison (`commitsBehind === null`, an unknown installed version
   included) lets the start through — the route still calls the deploy webhook
   with the body it builds itself and answers `202 { "started": true }`. The
   cooldown of five minutes, the missing webhook and the refused webhook keep
   their answers.
2. **The panel (`apps/web/src/admin/update-panel.tsx`).** The button „Update
   starten" appears when an update is available **and** when the versions cannot
   be compared; it stays away when the comparison proves that the installation is
   up to date. In the unknown state the panel names the consequence above the
   button (`notComparableHint`) and the confirm step uses its own text
   (`confirmNotComparable`), which says that the stack builds the newest state of
   the branch in any case. The confirm step, the reload button and the texts of
   the errors stay as they are.
3. **The texts (`de` and `en`).** `admin.update.notComparableHint` and
   `admin.update.confirmNotComparable` in the namespace `settings`; the existing
   key `notComparable` stays (it names the state).
4. **The spec (`specs/18-self-update.md`).** §18.2 names the button in the
   unknown state, §18.4 names the rule of the start: only a comparison that
   proves the up-to-date state refuses the start.
5. **The tests.** The API test proves that the start succeeds with a refused
   comparison and that the webhook is called; the web test proves that the
   button appears in the unknown state and that the confirm step starts the
   update.
6. **The plan, the backlog and the changelog.** `PLAN.md` §16 gets the status
   line of the phase 39, `work-packages/README.md` the row of the phase and the
   state of the WP, `CHANGELOG.md` the entry.

## Non-goals

- No change of the check endpoint and of its contract: `commitsBehind: null`
  stays the answer of the unknown state, `updateAvailable` stays `false` there.
- No automatic update, no update without the confirm step, no update without the
  permission `system.update`.
- No change of the deploy webhook: the body stays `version`, `current`,
  `requestedAt`, and no value of the request reaches it.
- No repair of the comparison itself (a tag that was never pushed upstream stays
  a tag that was never pushed) — the unknown state is now a state the operator
  can act on.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected result: all green; the new cases fail before the change and pass
after it.

## Handoff

- Files changed: `apps/api/src/update/routes.ts` (the start refuses only the
  proven up-to-date state), `apps/web/src/admin/update-panel.tsx` (the button
  and the texts of the unknown state), the two locale files, the two test
  files, `specs/18-self-update.md` §18.2/§18.4
- Interfaces added: `settings:admin.update.notComparableHint`,
  `settings:admin.update.confirmNotComparable`
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`), `npm run test:run` (295 files, 2101 cases green — the new cases
  of the API and of the panel included) and `npm run build` green; the browser
  E2E is **unverified** in this container (no Chromium — it skips by design)
- The commit carries the leftovers of an earlier session as well
  (`apps/web/src/auth/login-form.tsx` of WP-M31-17, `apps/web/src/styles.css`
  and `work-packages/m31/17-the-customer-finds-the-registration-at-the-login.md`)
  — the office asked for one commit for everything that was open
- Follow-up WP: none — the comparison of an unpushed tag stays a remark of this
  feature
- Open question: none
