# WP-M1-10b: Working GitHub issue forms

format: small-model
depends-on: WP-M1-10, WP-M0-05
phase: 1
context-budget: 14k tokens
spec: AGENTS.md "Conventions" (English), "Data protection and security" (112 notice, no other emergency number, no PII); WP-M1-10 split note and open question; `CHANGELOG.md` "The emergency notice uses 112 only"
spec-lines: 0

files-read:

- .github/ISSUE_TEMPLATE/bug.md
- .github/ISSUE_TEMPLATE/feature.md
- .github/ISSUE_TEMPLATE/security.md
- .prettierignore
- CONTRIBUTING.md

files-write:

- .github/ISSUE_TEMPLATE/bug.md
- .github/ISSUE_TEMPLATE/feature.md
- .github/ISSUE_TEMPLATE/security.md
- .prettierignore

interfaces:

- GitHub issue forms in `.github/ISSUE_TEMPLATE/{bug,feature,security}.md`: YAML
  front matter opened and closed by `---`, `body:` as a list whose items nest
  `type`, `id` and `attributes`, and `attributes` nests `label`, `description`,
  `placeholder` plus `validations.required`
- Issue types and labels stay `bug`, `feature`, `security`; the emergency notice
  is 112 only, `security.md` still points at `SECURITY.md` and forbids public
  vulnerability reports
- `.prettierignore` excludes `.github/ISSUE_TEMPLATE/`: Prettier formats the embedded YAML
  and flips the `labels` quote style, which would keep touching the hand-written forms

## Task

The three issue forms of WP-M1-10's era are broken: they lack the closing front-matter
delimiter, and the `body:` items have no nested indentation, so GitHub renders them as
plain text instead of a form. Fix the forms, do not redesign them.

1. For each of the three files: front matter starts on line 1 with `---` (no blank line
   after it) and ends with a closing `---`; no prose below the front matter.
2. Re-indent the `body:` list: `- type:` at two spaces, `id:` and `attributes:` at four,
   `label` / `description` / `placeholder` / `validations` at six, `required` at eight.
   Keep every existing `id`, `label`, `description` and `placeholder` text and the
   `required` flags unchanged.
3. Emergency notice in `bug.md` and `feature.md`: replace
   `In case of acute danger: **112** / **110**.` with the 112-only sentence
   `In an emergency call **112**.` — this resolves the open question of WP-M1-10 in
   favour of the AGENTS rule and the existing CHANGELOG entry. Keep the
   "not an emergency call path" sentence.
4. `security.md`: keep the "never a public issue" warning, the pointer to `SECURITY.md`,
   the internal-coordination note and the `summary` textarea with `required: true`.
   Keep the no-personal-data hint of `bug.md`.
5. `.prettierignore`: add `.github/ISSUE_TEMPLATE/` with an English comment, next to the
   existing drizzle-kit entry (whose German comment becomes English on the way).
6. Bookkeeping outside `files-write`: WP-M1-10b entry in the `Fixed` section of
   `CHANGELOG.md`, the `.github/workflows/` row of `docs/REPO-MAP.md` mentioning the
   issue forms, the status note in `work-packages/README.md`, and the WP-M1-10 open
   question marked as resolved (112 only).

## Non-goals

- No `config.yml`, no label or issue-type configuration, no new form fields.
- No change to `PULL_REQUEST_TEMPLATE.md`, `dependabot.yml` or the workflows.
- No validator script or CI job for the front matter; the acceptance grep plus the
  YAML parse are enough.
- No `docs/` placeholder rewrite (WP-M1-10c) and no ADR rewrite (WP-M1-10d).

## Acceptance

```bash
node -e "const y=require('js-yaml'),f=require('node:fs');for(const n of ['bug','feature','security']){const s=f.readFileSync('.github/ISSUE_TEMPLATE/'+n+'.md','utf8');const m=/^---\\n([\\s\\S]*?)\\n---\\n?$/.exec(s);const d=y.load(m[1]);console.log(n,d.name,d.labels,JSON.stringify(d.body.map(b=>[b.type,b.id??null,!!b.attributes?.validations?.required])))}"
npx prettier --check .github CONTRIBUTING.md
git grep -nI -i -E '\b(und|der|die|mit|nicht|bitte|siehe|für|bei)\b' -- .github
npm run check
```

Expected: the parse prints the three names, their labels and the required flags
(`bug` and `feature` require two fields, `security` one), Prettier reports no
reformat, the German-word grep finds nothing (exit 1), `npm run check` is green, and
the GitHub Actions `check` run of the pushed commit is green.

## Handoff

- Files changed: the three issue forms, `.prettierignore`, plus `CHANGELOG.md`,
  `docs/REPO-MAP.md`, `work-packages/README.md`, `work-packages/m1/10-ci-workflow.md`
- Interfaces added: none (the issue forms become valid; no code interface)
- Deviation: the German drizzle-kit comment in `.prettierignore` is translated while
  touching that file — it violated the English rule of `AGENTS.md`
- Follow-up WP: WP-M1-10c (English `docs/` placeholders), WP-M1-10d (English ADRs),
  WP-M1-11 (repo map normalization)
- Open question: none — the 110/112 question of WP-M1-10 is resolved to 112 only
