# WP-M14-179: the security plan names the transition administration pass

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.13; PLAN.md §16
spec-lines: 40

depends-on: WP-M14-178

files-read:

- docs/SECURITY-PLAN.md (the areas, the run procedure and the repeat rules)
- apps/web/src/admin/escalation-transitions.tsx (the new editor)
- apps/web/src/routes/index.tsx (the client route table)
- apps/web/src/settings/settings-page.tsx (the menu of the settings)
- specs/07-escalation.md (§7.13 the steps are configuration)
- work-packages/m14/175-the-transitions-of-the-workflow-in-the-escalation.md
  (the editor of the steps)

files-write:

- docs/SECURITY-PLAN.md
- work-packages/m14/179-the-security-plan-names-the-transition-pass.md,
  work-packages/README.md

interfaces:

- `docs/SECURITY-PLAN.md` — the pass note of the transition administration and
  the audit SHA of the areas A, B, C, D, H and K

## Task

1. `docs/SECURITY-PLAN.md` names the pass: the editor of the steps of the
   workflow is a web module — the API route table is unchanged, the client
   route table loses `/admin/transitions`, and the machine keys of a step are
   bound to their schema before the request leaves the browser. Areas A and B
   are re-checked in full, C, D, H and K for the changed files. No new finding.

## Non-goals

- No change of the code, of the API and of the permissions.
- No finding in a tracked file — the open findings stay in
  `.security/findings.md`.

## Acceptance

```bash
npm run lint
npm run wp:check
```

Expected: all green; the plan names the pass and the audit SHA.

## Handoff

- Files changed: `docs/SECURITY-PLAN.md`,
  `work-packages/README.md`, this document
- Interfaces added: none — the plan names the pass
- Verified: `npm run lint` (0 errors), `npm run wp:check` green
- Follow-up WP: none — the comment of the office is closed
- Open question: none
