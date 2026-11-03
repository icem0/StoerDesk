# WP-M2-43: self-update decision and spec

format: small-model
status: implemented
depends-on: WP-M2-09a
phase: 2
context-budget: 16k tokens
spec: specs/18-self-update.md (new), PLAN.md §19 (hosting model), §10 (PWA update)
spec-lines: 90

files-read:

- docs/DEPLOYMENT.md — deployment is a host checkout + compose build
- Dockerfile — the api image has no git/docker/host access
- apps/web/src/sw.ts, apps/web/src/lib/outbox.ts — the PWA update surface
- PLAN.md §4/§15/§19, §10 — network, security, PWA rules, open decisions

files-write:

- docs/DECISIONS/0004-self-update-model.md
- specs/18-self-update.md
- work-packages/m2/43-self-update-governance.md
- work-packages/m2/44-admin-update-page-pwa-refresh.md

interfaces:

- decision record ADR-0004: self-update is an out-of-band host agent, never exec
  in the `api` container, never an OS password; staged (stage 1 client update,
  stage 2 agent)
- contract owner: `specs/18-self-update.md` §18.1–§18.5

## Task

1. Write ADR-0004: why the requested "type the Linux password, run git pull +
   redeploy + image purge from the admin UI" cannot run in the api container and
   is a security violation, and the accepted out-of-band agent model with
   `UPDATE_AGENT_TOKEN`.
2. Create `specs/18-self-update.md`: hard rules (§18.1), the shippable stage 1
   (§18.2, client-only clean PWA update with the outbox guard), optional update
   availability (§18.3) and the planned stage 2 agent contract (§18.4).
3. Create this WP and its child `WP-M2-44` (stage-1 client update) so the
   follow-up has a file, not only a sentence.
4. Bookkeeping in the same commit: `docs/DECISIONS.md` index row, `specs/README.md`
   row 18, `PLAN.md` §19 (hosting model resolved) and §16 backlog,
   `work-packages/README.md`, `docs/REPO-MAP.md`, `CHANGELOG.md`.

## Non-goals

- No code, route, page or migration in this WP — governance only.
- No update agent, no `UPDATE_AGENT_TOKEN`, no `update_runs` table, no new
  permission key (all stage 2).
- No update-availability network check.

## Acceptance

```bash
npm run wp:check
npm run i18n:check
```

Expected: wp:check reports the two new small-model WPs green; i18n unchanged
(this WP writes no locale file).

## Handoff

- Files changed: the ADR, the spec slice and the two WP documents; plus the
  bookkeeping files named in task 4.
- Interfaces added: ADR-0004, `specs/18-self-update.md` §18.1–§18.5.
- Verified: `npm run wp:check` green (43/44 valid), i18n untouched.
- Follow-up WP: WP-M2-44 (stage-1 `/admin/update` clean PWA update) — file created
  in this commit. Stage 2 (agent, token, `update_runs`, `system.update`) stays
  planned in `specs/18-self-update.md` §18.4 and needs its own WP before code.
- Open question: update availability (§18.3) is optional — decided when a WP for it
  is opened, not here.
