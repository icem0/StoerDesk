#!/bin/sh
# Repeatable Docker smoke test (WP-M0-04, PLAN.md §18).
#
# Builds the images from the working tree, starts the core stack (db, api, web),
# waits for both health endpoints and tears the project down again including its
# volumes. Runs in its own Compose project with its own volumes and host ports,
# so it never touches the `.env` or the data of a developer stack.
#
#   sh scripts/docker-smoke.sh
#
# Requirements: Docker with the Compose plugin, plus curl.
# The stack publishes the web port only; override it with WEB_PORT if it collides.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

project=${SMOKE_PROJECT:-stoerdesk-smoke}
web_port=${WEB_PORT:-3180}
base_url="http://127.0.0.1:${web_port}"

# Compose reads the env file and the service `env_file: .env` relative to the
# project directory, so the whole run happens inside a throw-away directory
# while the build context stays the real checkout.
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/stoerdesk-smoke.XXXXXX")
cp "$repo_root/.env.example" "$work_dir/.env"
cat >>"$work_dir/.env" <<EOF

# --- smoke overrides (WP-M0-04) ---
COMPOSE_PROJECT_NAME=$project
IMAGE_BUILD_CONTEXT=$repo_root
WEB_PORT=$web_port
WEB_BIND_ADDRESS=127.0.0.1
PGDATA_VOLUME=${SMOKE_PGDATA_VOLUME:-stoerdesk_smoke_pgdata}
UPLOADS_VOLUME=${SMOKE_UPLOADS_VOLUME:-stoerdesk_smoke_uploads}
BACKUP_VOLUME=${SMOKE_BACKUP_VOLUME:-stoerdesk_smoke_backups}
EOF

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
  rm -rf "$work_dir"
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# --- 1. configuration ---
compose config --quiet
printf 'compose config ok (project %s, web port %s)\n' "$project" "$web_port"

# --- 2. images ---
compose build

# --- 3. start ---
compose up -d

# --- 3b. only the web frontend publishes a host port ---
# `compose port` also matches `expose` entries without a host binding; it then
# prints an empty host with port 0 (`:0`). Only a real, non-zero published port
# means the API is reachable from outside the network.
api_public_port=$(compose port api 3000 2>/dev/null || true)
case "$api_public_port" in
  ''|*:0)
    printf 'no api host port (internal backend network)\n'
    ;;
  *)
    printf 'api publishes a host port (%s) - it must stay on the internal network\n' "$api_public_port" >&2
    exit 1
    ;;
esac

# --- 4. health: the API is reached through the nginx proxy of the web container
wait_for() {
  i=0
  while [ "$i" -lt 60 ]; do
    if response=$(curl -fsS "$1" 2>&1); then
      printf 'GET %s -> %s\n' "$1" "$response"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  printf 'GET %s -> no healthy response within %ss\n' "$1" $((i * 2)) >&2
  return 1
}

if ! wait_for "$base_url/healthz" || ! wait_for "$base_url/api/v1/health"; then
  compose ps >&2
  compose logs --tail 40 >&2
  exit 1
fi

compose down -v --remove-orphans
trap - EXIT INT TERM
printf 'docker smoke test passed (project %s removed)\n' "$project"
