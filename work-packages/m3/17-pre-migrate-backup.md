# WP-M3-17: force a database dump before the API applies migrations

format: small-model
status: implemented
depends-on: WP-M3-09, WP-M3-12, WP-M3-15
phase: 3
milestone: m3
context-budget: 12k tokens
spec: PLAN.md §16 phase 3, docs/DEPLOYMENT.md "Services" and "Backups"
spec-lines: 35

files-read:

- docker-compose.yml — the `api` start, the `backup` profile service and the volumes
- docs/DEPLOYMENT.md — the service table and the backup section
- README.md — the install and architecture claim that the API migrates at start
- Dockerfile — the API `CMD` that runs `db/migrate.js` before the server
- .env.example — `BACKUP_RETENTION_DAYS`

files-write:

- docker-compose.yml
- docs/DEPLOYMENT.md
- README.md
- .env.example

interfaces:

- Compose service `db-backup-pre-migrate` (no profile): one-shot `pg_dump` into
  `${BACKUP_VOLUME}` as `/backups/pre-migrate-<stamp>.sql.gz`, exits non-zero on
  a failed or empty dump
- `api` gains `depends_on.db-backup-pre-migrate.condition: service_completed_successfully`;
  the API container is not created until the dump exists
- `BACKUP_RETENTION_DAYS` also deletes `pre-migrate-*.sql.gz` older than that window

## Task

Migrations run in the API `CMD` (`Dockerfile:43`: `node …/migrate.js && exec …`).
A broken migration therefore hits the production database at container start, and
an image rollback does not undo it. Ticket data holds personal data, so every
compose deployment must have a dump first.

1. Create this WP document.
2. Add the one-shot `db-backup-pre-migrate` service in `docker-compose.yml`: the
   Postgres image, the `backups` volume, the `db` health dependency, `restart: 'no'`
   and an entrypoint that writes the dump through a `.sql` file plus `gzip -t`,
   then moves the verified `.tmp` file into place. No profile, so it also runs
   when `backup` is off.
3. Make `api` depend on that service with
   `condition: service_completed_successfully`, next to the existing `db` health
   dependency. A failed dump stops the API from starting and thus from migrating.
4. Document the gate in `README.md`, `docs/DEPLOYMENT.md` (service table and
   backup section) and note on `BACKUP_RETENTION_DAYS` that it also bounds these
   dumps.
5. Update the phase record (`PLAN.md` §16, `work-packages/README.md`,
   `CHANGELOG.md`, `docs/REPO-MAP.md`).

## Non-goals

- No automatic restore and no restore drill (phase 10).
- No change to the periodic `backup` profile service, its interval or its naming.
- No change to `scripts/update.sh`, the deploy hook or the API migration code.
- No encryption of the dump; it stays in the existing backup volume like the
  periodic dumps.

## Acceptance

```bash
node -e "require('js-yaml').load(require('fs').readFileSync('docker-compose.yml','utf8'))"
sh -n scripts/update.sh
npm run wp:check
npm run check
npm run build
```

Expected: YAML parses, the checks are green. `docker compose config`, `build` and
`up -d` are unverified in this container (no Docker daemon); the CI docker smoke
job and a real deployment must confirm them. Report the Docker checks as
unverified, never as green (`PLAN.md` §18).

## Handoff

- Files changed: `docker-compose.yml`, `docs/DEPLOYMENT.md`, `README.md`,
  `.env.example`, plus the bookkeeping files named in task step 5
- Interfaces added: `db-backup-pre-migrate` and the `service_completed_successfully`
  gate on `api`; `BACKUP_RETENTION_DAYS` now also bounds `pre-migrate-*.sql.gz`
- Verified: YAML parse, `npm run wp:check`, `npm run check`, `npm run build`
- Unverified: `docker compose config/build/up` (no Docker daemon in the container)
- Follow-up WP: none
- Open question: whether a later hardening WP should also gate the update menu
  start (the webhook) on a dump outside Compose; that path ends in
  `docker compose up`, so this gate already applies to it
