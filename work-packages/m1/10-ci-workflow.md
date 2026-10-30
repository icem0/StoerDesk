# WP-M1-10: English CI and governance files

format: small-model
depends-on: WP-M1-01, WP-M0-05
phase: 1
context-budget: 18k tokens
spec: PLAN.md §3 (language rule), §15 (maintainability), §18 (quality gates); AGENTS.md "Conventions", "Commits", "Data protection and security"; specs/00-conventions.md §0.2 is still a placeholder, so PLAN.md and AGENTS.md are authoritative
spec-lines: 0

files-read:

- AGENTS.md
- CONTRIBUTING.md
- SECURITY.md
- CODE_OF_CONDUCT.md
- .github/workflows/check.yml
- README.md

files-write:

- CONTRIBUTING.md
- SECURITY.md
- CODE_OF_CONDUCT.md
- .github/workflows/check.yml

interfaces:

- CI jobs of `.github/workflows/check.yml`: `check` (PostgreSQL 16 service,
  `TEST_DATABASE_URL`, `npm ci`, `npm run check`, `npm run build`), `docker-smoke`
  (guarded by a Docker detection step), `playwright` (chromium install, then
  `npm run test:run --workspace @stoerdesk/web`) — all step names in English
- `CODE_OF_CONDUCT.md` is the Contributor Covenant 2.1 text (English) with the
  project reporting channel; `CONTRIBUTING.md` states Node ≥ 22.12, setup,
  Conventional Commits + DCO, one WP = one commit, `npm run check` before push and
  the PR process
- `SECURITY.md` states: no public issues for vulnerabilities, private reporting
  channel, supported versions, operator notes (the 112 notice stays on the form and
  the stickers); the 112-only emergency wording is unchanged everywhere

## Task

Split note: the legacy package listed eleven items, and most of them are already
delivered — `check.yml`, `build.yml`, `LICENSE`, `README.md`, `CHANGELOG.md`,
`dependabot.yml`, `PULL_REQUEST_TEMPLATE.md` and the `docs/` files exist. The open
gap is the English rule of `AGENTS.md`: the CI step name and three governance files
are German. Follow-ups from this split: **WP-M1-10b** (issue forms — the three
templates lost their closing front-matter delimiter and their nested indentation,
so GitHub does not render them; also ignore `.github/ISSUE_TEMPLATE/` in
`.prettierignore`), **WP-M1-10c** (English `docs/ARCHITECTURE.md`,
`docs/COMPLIANCE.md`, `docs/GLOSSARY.md`, `docs/I18N.md`), **WP-M1-10d** (English
`docs/DECISIONS.md` index plus the two ADRs in `docs/DECISIONS/`, English slugs).

1. Audit first, change nothing that is already correct: `check.yml` defines the
   three jobs, `build.yml` publishes the versioned images, `LICENSE` is MIT,
   `README.md` starts with the 112 notice and a license badge, `CHANGELOG.md` has
   an `Unreleased` section, `dependabot.yml` covers npm and github-actions and the
   PR template references the WP.

2. `.github/workflows/check.yml`: rename the single German step name
   `Playwright-Browser installieren` to English. Job, services, steps and the
   chromium install stay exactly as they are — the Playwright job stays an
   accepted placeholder until the real E2E of WP-M1-12 exists.

3. `CONTRIBUTING.md`: full English rewrite of the existing content. Keep the
   requirements, setup commands, branching and commit rules (Conventional Commits,
   DCO with `git commit -s`, one WP = one commit with the WP in the subject),
   `npm run check` before pushing, the PR checklist and the pointer to
   `CODE_OF_CONDUCT.md` and `SECURITY.md`.

4. `SECURITY.md`: English rewrite. Drop the claim that a `SECURITY_CONTACT`
   variable exists in `.env` (no such variable is defined) and describe the real
   path instead: private report to the operator of the instance (e-mail address
   from the deployment) or GitHub private vulnerability reporting when enabled,
   never a public issue. Keep the report contents list, the supported version
   table and the operator notes (`SESSION_SECRET`, no `.env` in the repository,
   no PII in logs, the 112 notice must not be removed).

5. `CODE_OF_CONDUCT.md`: replace the paraphrase with the Contributor Covenant 2.1
   text (English: pledge, standards, enforcement), keep the link to the upstream
   version and name the project maintainers as the reporting contact.

6. Bookkeeping outside `files-write`: a WP-M1-10 entry in the `Unreleased` section
   of `CHANGELOG.md`, and the German remainder (`docs/REPO-MAP.md`, normalized in
   WP-M1-11) noted in `docs/REPO-MAP.md`.

## Non-goals

- No new CI job, no new secrets, no caching changes; `build.yml` is untouched.
- No change to the issue templates or `dependabot.yml` (WP-M1-10b).
- No change to `docs/ARCHITECTURE.md`, `docs/COMPLIANCE.md`, `docs/GLOSSARY.md`,
  `docs/I18N.md` (WP-M1-10c) or the ADRs (WP-M1-10d).
- No new `SECURITY_CONTACT` variable in `.env.example`: the document must not
  promise configuration that does not exist.
- No product text change: the 112 notice stays, no other emergency number.

## Acceptance

```bash
npm run lint
npm run i18n:check
npm run wp:check
npx prettier --check .github CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md
git grep -lI -P '[äöüÄÖÜß]' -- CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md .github/workflows
```

Expected: lint, i18n and wp:check green, Prettier reports no reformat, the last
command finds nothing, and the GitHub Actions `check` run of the pushed commit is
green — a local `npm run check` alone is not enough.

## Handoff

- Files changed: the four files above, plus `CHANGELOG.md` and `docs/REPO-MAP.md`
- Interfaces added: none (documentation and one CI step name)
- Deviation: `SECURITY.md` no longer names a `SECURITY_CONTACT` variable, because
  `.env.example` does not define one
- Follow-up WP: WP-M1-10b (issue forms), WP-M1-10c (English docs),
  WP-M1-10d (English ADRs), WP-M1-11 (repo map, incl. its German text)
- Open question: should the issue templates keep the police number 110, or only 112
  like the product text?
