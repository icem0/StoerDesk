#!/bin/sh
# StörDesk host update.
#
#   sh scripts/update.sh            # check GitHub, ask, pull, rebuild, prune
#   sh scripts/update.sh --check    # only compare the local and remote version
#   sh scripts/update.sh --yes      # update without the confirmation
#
# Works with a git checkout (pull) and with panel deployments such as Arcane
# (no checkout: the compose build fetches the sources through
# IMAGE_BUILD_CONTEXT). Only the running stack is rebuilt; the optional
# update-agent profile is never touched.
set -eu

REPO_SLUG="${STOERDESK_REPO_SLUG:-icem0/StoerDesk}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$ROOT_DIR"

MODE=update
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --yes | -y) ASSUME_YES=1 ;;
    -h | --help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *)
      printf 'update: unknown option: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() {
  printf 'update: %s\n' "$*" >&2
  exit 1
}

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --max-time 25 "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- --timeout=25 "$1"
  elif command -v node >/dev/null 2>&1; then
    node -e '
      fetch(process.argv[1])
        .then(async (response) => {
          if (!response.ok) process.exit(1)
          process.stdout.write(await response.text())
        })
        .catch(() => process.exit(1))
    ' "$1"
  else
    die 'curl, wget or node is needed to reach GitHub'
  fi
}

# The highest vMAJOR.MINOR.PATCH tag, git first (no API rate limit), then the
# GitHub API for a panel folder without a checkout.
remote_version() {
  if command -v git >/dev/null 2>&1 &&
    git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    tags=$(git -C "$ROOT_DIR" ls-remote --tags --refs \
      "https://github.com/$REPO_SLUG.git" 'v*' 2>/dev/null || true)
    version=$(printf '%s\n' "$tags" |
      sed -n 's#.*refs/tags/\(v[0-9][0-9.]*\)$#\1#p' |
      sed 's/^v//' |
      sort -t. -k1,1n -k2,2n -k3,3n |
      tail -n 1)

    if [ -n "$version" ]; then
      printf 'v%s\n' "$version"
      return 0
    fi
  fi

  body=$(fetch "https://api.github.com/repos/$REPO_SLUG/releases/latest" 2>/dev/null || true)
  version=$(printf '%s\n' "$body" |
    sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\(v[0-9][^"]*\)".*/\1/p' |
    head -n 1)

  if [ -z "$version" ]; then
    body=$(fetch "https://api.github.com/repos/$REPO_SLUG/tags?per_page=100") ||
      die 'cannot read the tags from GitHub'
    version=$(printf '%s\n' "$body" |
      sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\(v[0-9][^"]*\)".*/\1/p' |
      sed 's/^v//' |
      sort -t. -k1,1n -k2,2n -k3,3n |
      tail -n 1)
    [ -n "$version" ] && version="v$version"
  fi

  [ -n "$version" ] || die 'GitHub returned no version tag'
  printf '%s\n' "$version"
}

local_version=$(tr -d '[:space:]' <VERSION 2>/dev/null || true)
latest=$(remote_version)

say "Lokal:  ${local_version:-unbekannt}"
say "GitHub: $latest"

if [ -n "$local_version" ] && [ "$local_version" = "$latest" ]; then
  say 'Der Server ist bereits auf der neuesten Version.'
  exit 0
fi

if [ "$MODE" = check ]; then
  say "Update verfügbar: $latest"
  exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Update auf %s jetzt einspielen? [j/N] ' "$latest"
  read -r answer || answer=n

  case "$answer" in
    j | J | y | Y | ja | Ja | yes | Yes) ;;
    *)
      say 'Abgebrochen.'
      exit 0
      ;;
  esac
fi

if command -v git >/dev/null 2>&1 &&
  git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  say 'Ziehe das Repository …'
  git -C "$ROOT_DIR" -c "safe.directory=$ROOT_DIR" pull --ff-only --autostash ||
    die 'git pull failed'
else
  say 'Kein Git-Checkout (z. B. Arcane): der Compose-Build holt die Quellen selbst.'

  if ! grep -q '^IMAGE_BUILD_CONTEXT=\(https\?\|git\|ssh\)' .env 2>/dev/null; then
    say 'WARNUNG: IMAGE_BUILD_CONTEXT zeigt nicht auf eine Git-URL.'
    say "         Setze IMAGE_BUILD_CONTEXT=https://github.com/$REPO_SLUG.git#main"
    say '         oder synchronisiere die Dateien vorher (Arcane Sync).'
  fi
fi

command -v docker >/dev/null 2>&1 || die 'docker is not installed'

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  die 'docker compose is not installed'
fi

project=
if [ -f .env ]; then
  project=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env | tail -n 1 | sed 's/^"//; s/"$//')
fi

if [ -z "$project" ]; then
  project=$(docker ps --filter 'label=com.docker.compose.service=web' \
    --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | head -n 1 || true)
fi

if [ -z "$project" ]; then
  project=$(docker ps --filter 'label=com.docker.compose.service=api' \
    --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | head -n 1 || true)
fi

profiles=
if [ -n "$project" ] &&
  docker ps --filter "label=com.docker.compose.project=$project" \
    --format '{{.Label "com.docker.compose.service"}}' 2>/dev/null | grep -qx backup; then
  profiles='--profile backup'
fi

set --
if [ -n "$project" ]; then
  set -- -p "$project"
fi

say 'Baue den Stack neu …'
# shellcheck disable=SC2086
compose "$@" $profiles --project-directory "$ROOT_DIR" \
  -f "$ROOT_DIR/docker-compose.yml" up -d --build ||
  die 'docker compose up failed'

say 'Entferne alte Images …'
if [ -n "$project" ]; then
  docker image prune -f --filter "label=com.docker.compose.project=$project"
else
  docker image prune -f
fi

say "Fertig. Version auf dem Server: $(tr -d '[:space:]' <VERSION 2>/dev/null || printf 'unbekannt')"
