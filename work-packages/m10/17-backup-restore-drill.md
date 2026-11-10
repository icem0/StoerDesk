# WP-M10-17: Uploads backup, restore procedure and drill

format: small-model
status: done
depends-on: WP-M10-16
phase: 10
milestone: m10
context-budget: 20k tokens
spec: specs/14-nfr.md §15.3; docs/DECISIONS/0014-privacy-retention-and-restore-drill.md
spec-lines: 80

files-read:

- specs/14-nfr.md (§15.3)
- docs/DEPLOYMENT.md (backup section)
- docker-compose.yml (backup service)
- scripts/docker-smoke.sh

files-write:

- docker-compose.yml
- docs/DEPLOYMENT.md
- scripts/restore-drill.sh
- scripts/docker-smoke.sh

interfaces:

- backup profile writes a database dump and an uploads archive
- `scripts/restore-drill.sh` proves dump + uploads restore

## Task

1. Extend the `backup` profile to tar the uploads volume next to the database
   dump, with the same retention window.
2. Document the restore of database and uploads together.
3. Add `scripts/restore-drill.sh`: create a throwaway database, seed rows and a
   photo, dump, restore into fresh targets, compare row counts and the photo
   manifest.
4. Call the drill in the Docker smoke test and report a missing Docker daemon as
   unverified, never green.

## Non-goals

- No encryption or off-site storage.
- No restore button in the admin UI.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
sh -n scripts/restore-drill.sh
```

Expected: all green; the Docker smoke job runs the drill in CI.

## Handoff

- Files changed: Compose, deployment docs, the drill and the smoke script
- Interfaces added: uploads backup and the restore drill
- Verified: the commands above; Docker drill verified in CI
- Follow-up WP: WP-M10-18
- Open question: none
