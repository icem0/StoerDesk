# Contributing

Thanks for contributing to StörDesk.

## Requirements

- Node.js ≥ 22.12
- npm ≥ 11
- Docker (for a local PostgreSQL 16)

## Setup

```bash
npm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d db
```

## Branches and commits

- Feature branches from `main`: `feat/wp-m1-09-admin-ui`, `fix/…`, `docs/…`.
- **Conventional Commits**: `feat(web): …`, `fix(api): …`, `docs(spec): …`,
  `chore(repo): …` — subject and body in English.
- **Language**: code, identifiers, comments, test names, commit messages and
  developer documentation are English; visible UI text only through i18n keys
  (see `AGENTS.md`).
- **One work package = one commit.** The commit subject names the work package:
  `feat(api): WP-M1-09 admin users API`.
- **DCO**: sign every commit with `git commit -s`. The `commit-msg` hook
  (commitlint) checks the Conventional Commit format and the sign-off.
- **Version tags**: the `post-commit` hook creates the next annotated patch tag
  (`v0.0.N`) on the new commit; tags are published with `git push --follow-tags`.

## Before pushing

```bash
npm run check
```

Typecheck, lint, tests, `i18n:check` and `wp:check` must be green. Run
`npm run build` as well when build artefacts are affected. After the push, wait
for the GitHub Actions `check` run — the `publish images` workflow publishes the
versioned images only after `check` succeeded.

## Pull requests

- PR description with a link to the implemented work package.
- Reference the issue or work package when one exists.
- Screenshots for UI changes, in German and in English.
- At least one review before merging.

## Code of conduct and security

Behavioral expectations are in `CODE_OF_CONDUCT.md`. Report vulnerabilities **not**
as a public issue — see `SECURITY.md`.
