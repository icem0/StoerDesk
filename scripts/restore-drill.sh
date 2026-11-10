#!/bin/sh
# Restore drill (WP-M10-17, ADR-0014 decision 6, specs/14-nfr.md §15.3).
#
# Proves that the `backup` profile of docker-compose.yml writes a database dump
# AND an uploads archive that restore together to the same row counts and the
# same photo manifest: it seeds two tables and two photo files, lets the
# profile write `stoerdesk-<stamp>.sql.gz` plus
# `stoerdesk-<stamp>-uploads.tar.gz`, replays them into a fresh database and a
# fresh uploads volume and compares counts and manifest.
#
#   sh scripts/restore-drill.sh
#
# Runs in its own Compose project with its own throw-away volumes, so it never
# touches the data of a deployment. Requirements: Docker with the Compose
# plugin. Without a usable daemon the drill exits 1 and reports itself
# UNVERIFIED — a missing Docker is never reported as green (PLAN.md §18).
# The CI job `docker-smoke` calls it after the stack passed its health checks.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

project=${DRILL_PROJECT:-stoerdesk-restore-drill}
pg_vol=${DRILL_PGDATA_VOLUME:-stoerdesk_drill_pgdata}
uploads_vol=${DRILL_UPLOADS_VOLUME:-stoerdesk_drill_uploads}
backup_vol=${DRILL_BACKUP_VOLUME:-stoerdesk_drill_backups}
restored_uploads_vol=${DRILL_RESTORED_UPLOADS_VOLUME:-stoerdesk_drill_restored_uploads}
db_name=${DRILL_POSTGRES_DB:-stoerdesk}
db_user=${DRILL_POSTGRES_USER:-stoerdesk}
restore_db=${DRILL_RESTORE_DB:-drill_restored}
postgres_image=${POSTGRES_IMAGE:-postgres:16-alpine}

# --- 0. docker availability: unverified without a daemon, never green ---
if ! docker info >/dev/null 2>&1; then
  printf 'restore drill UNVERIFIED: no usable Docker daemon\n' >&2
  exit 1
fi

compose() {
  docker compose \
    --project-directory "$work_dir" \
    --env-file "$work_dir/.env" \
    -p "$project" \
    -f "$repo_root/docker-compose.yml" \
    "$@"
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  docker volume rm "$restored_uploads_vol" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/stoerdesk-drill.XXXXXX")
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

cp "$repo_root/.env.example" "$work_dir/.env"
cat >>"$work_dir/.env" <<EOF

# --- restore drill overrides (WP-M10-17) ---
COMPOSE_PROJECT_NAME=$project
IMAGE_BUILD_CONTEXT=$repo_root
PGDATA_VOLUME=$pg_vol
UPLOADS_VOLUME=$uploads_vol
BACKUP_VOLUME=$backup_vol
BACKUP_INTERVAL_SECONDS=3600
EOF

# --- 1. throw-away source database ---
compose up -d db >/dev/null

wait_db() {
  i=0
  while [ "$i" -lt 30 ]; do
    if compose exec -T db psql -U "$db_user" -d "$db_name" -t -A -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  return 1
}

if ! wait_db; then
  compose logs db >&2
  printf 'restore drill UNVERIFIED: the throw-away database never became ready\n' >&2
  exit 1
fi

printf 'drill stack up (project %s, db %s)\n' "$project" "$db_name"

# --- 2. seed rows and photos ---
compose exec -T db psql -U "$db_user" -d "$db_name" -q <<SQL
create table drill_rows (n integer);
insert into drill_rows (n) values (1), (2), (3);
create table drill_photos (path text);
insert into drill_photos (path) values ('tickets/drill/photo-1.jpg'), ('tickets/drill/photo-2.jpg');
SQL

docker run --rm -v "$uploads_vol:/data/uploads" "$postgres_image" \
  sh -c 'mkdir -p /data/uploads/tickets/drill &&
    printf "drill photo one\n" > /data/uploads/tickets/drill/photo-1.jpg &&
    printf "drill photo two\n" > /data/uploads/tickets/drill/photo-2.jpg'

printf 'seeded 3 rows, 2 photo-path rows and 2 photo files\n'

# --- 3. the backup profile writes the dump and the uploads archive ---
compose --profile backup up -d backup >/dev/null

dump_name=''
archive_name=''
i=0
while [ "$i" -lt 60 ]; do
  listing=$(compose exec -T backup sh -c 'ls -1 /backups 2>/dev/null' || true)
  dump_name=$(printf '%s\n' "$listing" | grep 'stoerdesk-.*\.sql\.gz$' | tail -n 1 || true)
  archive_name=$(printf '%s\n' "$listing" | grep 'stoerdesk-.*-uploads\.tar\.gz$' | tail -n 1 || true)
  if [ -n "$dump_name" ] && [ "$archive_name" = "${dump_name%.sql.gz}-uploads.tar.gz" ]; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ -z "$dump_name" ] || [ -z "$archive_name" ]; then
  compose logs backup >&2
  printf 'restore drill UNVERIFIED: the backup profile wrote no dump + archive pair\n' >&2
  exit 1
fi

printf 'backup pair: %s + %s\n' "$dump_name" "$archive_name"

# --- 4. restore both into fresh targets ---
compose exec -T db psql -U "$db_user" -d "$db_name" -q \
  -c "drop database if exists $restore_db; create database $restore_db;"
compose exec -T backup sh -c "gunzip -c /backups/$dump_name" \
  | compose exec -T db psql -U "$db_user" -d "$restore_db" -q
docker run --rm -v "$backup_vol:/backups:ro" -v "$restored_uploads_vol:/data/uploads" "$postgres_image" \
  sh -c "tar xzf /backups/$archive_name -C /data/uploads"

printf 'restored into database %s and volume %s\n' "$restore_db" "$restored_uploads_vol"

# --- 5. compare row counts and the photo manifest ---
row_count() {
  compose exec -T db psql -U "$db_user" -d "$1" -t -A -c "select count(1) from $2"
}

rows_source=$(row_count "$db_name" drill_rows)
rows_restored=$(row_count "$restore_db" drill_rows)
photos_source=$(row_count "$db_name" drill_photos)
photos_restored=$(row_count "$restore_db" drill_photos)

file_manifest() {
  docker run --rm -v "$1:/data/uploads" "$postgres_image" \
    sh -c 'tar cf - -C /data/uploads .' | tar tf - | sort
}

manifest_source=$(file_manifest "$uploads_vol")
manifest_restored=$(file_manifest "$restored_uploads_vol")

if [ "$rows_source" != "3" ] || [ "$photos_source" != "2" ]; then
  printf 'restore drill FAILED: the seeded source rows differ (%s/%s)\n' "$rows_source" "$photos_source" >&2
  exit 1
fi

if [ "$rows_source" != "$rows_restored" ] || [ "$photos_source" != "$photos_restored" ]; then
  printf 'restore drill FAILED: rows %s/%s vs restored %s/%s\n' \
    "$rows_source" "$photos_source" "$rows_restored" "$photos_restored" >&2
  exit 1
fi

if [ "$manifest_source" != "$manifest_restored" ]; then
  printf 'restore drill FAILED: photo manifest differs\n%s\n---\n%s\n' \
    "$manifest_source" "$manifest_restored" >&2
  exit 1
fi

printf 'restore drill passed: dump restores %s rows and %s photo paths, uploads archive restores the seeded manifest\n' \
  "$rows_restored" "$photos_restored"
