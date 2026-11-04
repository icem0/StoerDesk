# WP-M3-16: update.sh compares the running version, not the folder

format: small-model
status: implemented
depends-on: WP-M3-15
phase: 3
milestone: m3
context-budget: 10k tokens
spec: specs/18-self-update.md §18.7
spec-lines: 40

files-read:

- scripts/update.sh — the decision of the host update
- specs/18-self-update.md — §18.7 the shell script
- docs/DEPLOYMENT.md — the host update section

files-write:

- scripts/update.sh
- specs/18-self-update.md
- docs/DEPLOYMENT.md

interfaces:

- `running_version()` — the `/app/VERSION` of the api container of the project,
  empty when nothing runs or the image has no version file
- the printed lines `Laufend:` and `GitHub:` replace `Lokal:` and `GitHub:`

## Task

`update.sh` compared the `VERSION` file of the folder with GitHub. A synced panel
folder can already carry the new version while the containers still run the old
images. The script then reported "already up to date" and never rebuilt.

1. `running_version()` reads `/app/VERSION` from the running api container of
   the project. The project comes from `detect_project`, so a foreign stack on the
   same host (another `api` container) does not count.
2. The decision uses that version. Unknown means: not up to date, so the stack
   is rebuilt.
3. The spec and the deployment guide describe the new comparison.

## Non-goals

- No change of the rebuild itself and of the clean-up.
- No change of the menu: the menu already reads the version of the image.

## Acceptance

```bash
sh -n scripts/update.sh
sh scripts/update.sh --check
npm run check
```

Expected: the syntax check is green; without docker the check reports
`Laufend: unbekannt` and an available update.

## Handoff

- Files changed: `scripts/update.sh`, the spec, the deployment guide
- Interfaces added: `running_version()`
- Verified: the syntax check and the `--check` path without docker. The rebuild
  path on a host with the stack is unverified until it runs there.
- Follow-up WP: none
- Open question: none
