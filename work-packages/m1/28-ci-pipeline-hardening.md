# WP-M1-28: CI pipeline hardening (push guard, promote gate, deploy, smoke)

format: small-model
status: implemented
depends-on: WP-M1-19 (one tag per push), WP-M1-21 (serialised `latest` promotion)
phase: 1
context-budget: 22k tokens
spec: PLAN.md §18.3 (tag-triggered CI, one tag per push), docs/DEPLOYMENT.md (deploy hook, host update)
spec-lines: 30

The publish chain had four gaps: a batch push of more than three tags still started
no run, `promote` advanced `latest` even when one image build failed, the documented
redeploy webhook was never called by a workflow, and the Docker smoke job stayed
green when the runner had no Docker.

files-read:

- .github/workflows/check.yml — the gate and `docker-smoke` job
- .github/workflows/build.yml — `version`, `publish`, `promote`, tags and concurrency
- .husky/pre-commit, .husky/post-commit — hook style and the one-tag-per-commit rule
- docs/DEPLOYMENT.md — the deploy hook and its `X-Deploy-Token` request
- scripts/deploy-hook.mjs — the receiver: `POST /hooks/deploy`, `X-Deploy-Token`, body ignored
- AGENTS.md — the commit and push rules

files-write:

- .husky/pre-push — reject a push with more than three tags
- .github/workflows/check.yml — Docker is a hard prerequisite, no silent skip
- .github/workflows/build.yml — `promote` gated on `publish`, new `deploy` job
- AGENTS.md — push after every work package, never batch

interfaces:

- `.husky/pre-push` reads the refs of stdin, counts `refs/tags/*` and exits `1` with
  a message above three tags; otherwise exits `0`.
- `promote` runs only when `needs.publish.result == 'success'`; a failed image build
  leaves `latest` on the newest fully published version.
- `deploy` needs `[version, publish, promote]`, runs only when
  `needs.promote.result == 'success'`, concurrency `deploy`, `contents: read`, and
  posts `{"version", "sha"}` to `DEPLOY_WEBHOOK_URL`. Missing URL or secret is a
  notice plus `exit 0`; an older version than the highest `v[0-9]*` tag is a
  notice plus `exit 0`. The shipped hook authenticates with `X-Deploy-Token`; the
  job also sends the HMAC `X-Signature-256`.
- `docker-smoke` fails in `Detect Docker` when Docker is unusable; the `Smoke test`
  step no longer has an `available` condition.

## Task

1. Create the WP document in this commit.
2. Add `.husky/pre-push` in the style of the existing hooks: read stdin, count
   `refs/tags/*`, and abort with a clear message naming the tag count and the
   one-work-package-per-push rule when the count exceeds three.
3. Add the same push rule to `AGENTS.md` under _Commits_: push immediately after
   every work package with `git push --follow-tags`; never collect several.
4. Change the `promote` condition in `build.yml` to
   `${{ needs.publish.result == 'success' }}` and update its comment.
5. Read `docs/DEPLOYMENT.md` and `scripts/deploy-hook.mjs`: the documented
   redeploy receiver is `POST /hooks/deploy` with `X-Deploy-Token` and no body
   semantics. Add the `deploy` job after `promote`, adapt the header to that
   receiver while keeping the HMAC header, and guard the version order.
6. Document `DEPLOY_WEBHOOK_URL`, `DEPLOY_WEBHOOK_SECRET`, the payload and the
   version guard in `docs/DEPLOYMENT.md`.
7. Make `docker-smoke` fail when Docker is missing and drop the `if` on the smoke
   step.
8. Update `docs/REPO-MAP.md`, `PLAN.md` §18.3, `work-packages/README.md` and
   `CHANGELOG.md`.

## Non-goals

- No Dockerfile, image-tag or tag-logic change in `build.yml`.
- No domain code and no workflow trigger change; no Actions pinned to SHAs.
- No new deployment mechanism: the job calls the already documented deploy hook.

## Acceptance

```bash
npm run check
```

Expected: green. The pre-push guard is checked with a local dry run: four tag refs
are rejected, one tag ref passes. The Docker smoke test cannot run in this
container (no Docker daemon); it is proven by CI, never reported as green.

## Handoff

- Files changed: `.husky/pre-push`, both workflows, `AGENTS.md`,
  `docs/DEPLOYMENT.md`, `docs/REPO-MAP.md`, `PLAN.md` §18.3,
  `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the pre-push guard; the `deploy` job and its two secrets
- Verified: `npm run check`; pre-push guard dry run with four and one tag
- Deviation: the deploy job sends `X-Deploy-Token` in addition to
  `X-Signature-256`, because the documented receiver authenticates with
  `X-Deploy-Token` and ignores the body.
- Follow-up WP: none
- Open question: none
