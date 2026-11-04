#!/bin/sh
# StörDesk host update.
#
#   sh scripts/update.sh            # check GitHub, ask, pull, rebuild, clean up
#   sh scripts/update.sh --check    # only compare the local and remote version
#   sh scripts/update.sh --yes      # update without the confirmation
#   sh scripts/update.sh --cleanup  # only clean up images: no pull, no rebuild
#   sh scripts/update.sh --gc       # additionally drop tagless images and build
#                                   # cache older than STOERDESK_GC_UNTIL hours
#
# Works with a git checkout (pull) and with panel deployments such as Arcane
# (no checkout: the compose build fetches the sources through
# IMAGE_BUILD_CONTEXT). Only the running stack is rebuilt; the optional
# update-agent profile is never touched.
#
# Why the clean-up works from image ids and not only from labels: the rebuild
# moves the fixed `:latest` tags of this stack to the new images, so every
# previous image of the stack turns tagless. `docker image prune` with the
# project label only finds a tagless image when the build wrote that label into
# the image — it does not for a build from a remote build context, not for the
# `docker-compose` v1 fallback this script accepts and not for an aborted build.
# Those images stayed on the host for every update. The clean-up below therefore
# works from the image names of docker-compose.yml and the Compose default names
# of the project, and deletes by image id whatever neither a container of this
# project nor a current tag of this stack needs.
set -eu

REPO_SLUG="${STOERDESK_REPO_SLUG:-icem0/StoerDesk}"
# The image names docker-compose.yml gives the built services. Pulled images such
# as postgres are deliberately not part of the clean-up.
OWN_IMAGES="${STOERDESK_OWN_IMAGES:-stoerdesk-api:latest stoerdesk-web:latest stoerdesk-agent:latest}"
# The `--gc` window in hours for the backlog an older version left behind.
GC_UNTIL="${STOERDESK_GC_UNTIL:-168}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$ROOT_DIR"

MODE=update
ASSUME_YES=0
GC=0

for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --cleanup) MODE=cleanup ;;
    --gc) GC=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    -h | --help)
      sed -n '2,10p' "$0"
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

require_compose() {
  command -v docker >/dev/null 2>&1 || die 'docker is not installed'

  if docker compose version >/dev/null 2>&1; then
    compose() { docker compose "$@"; }
  elif command -v docker-compose >/dev/null 2>&1; then
    compose() { docker-compose "$@"; }
  else
    die 'docker compose is not installed'
  fi
}

# The compose project of the running stack: the name from `.env` or the label of
# the running containers, so a panel-specific project is updated and not a second
# stack created next to it.
detect_project() {
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
}

# The image name patterns this deployment owns: its own repositories and the
# Compose default names of the project (older layouts, retired service names).
own_patterns() {
  # shellcheck disable=SC2086  # OWN_IMAGES is a word list on purpose
  for name in $OWN_IMAGES; do
    printf '%s*\n' "${name%%:*}"
  done

  if [ -n "$project" ]; then
    printf '%s\n' "${project}-*" "${project}_*"
  fi
}

own_ids() {
  own_patterns | while IFS= read -r pattern; do
    docker image ls --no-trunc -q --filter "reference=$pattern" 2>/dev/null || true
  done | sort -u | tr '\n' ' '
}

# The ids a clean-up never removes: the current image of each own image name and
# the image of every container of this compose project.
kept_ids() {
  {
    # shellcheck disable=SC2086
    for name in $OWN_IMAGES; do
      docker image inspect --format '{{.Id}}' "$name" 2>/dev/null || true
    done

    if [ -n "$project" ]; then
      for container in $(docker ps -aq \
        --filter "label=com.docker.compose.project=$project" 2>/dev/null || true); do
        docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true
      done
    fi
  } | sort -u | tr '\n' ' '
}

# The clean-up of the images captured before the rebuild. It has to run on that
# snapshot: once the rebuild moved the `:latest` tags, the previous image is
# tagless and no name filter finds it any more. `docker rmi` without `-f`: an
# image a container still holds stays on the host.
clean_images() {
  keep=$(kept_ids)
  removed=0
  busy=0

  for id in $captured; do
    case " $keep " in
      *" $id "*) continue ;;
    esac

    if docker rmi "$id" >/dev/null 2>&1; then
      removed=$((removed + 1))
    else
      busy=$((busy + 1))
    fi
  done

  say "Eigene Images bereinigt: $removed entfernt, $busy noch in Benutzung."

  # Best effort on top of the name-based clean-up: the tagless images of this
  # project that do carry the label.
  if [ -n "$project" ]; then
    docker image prune -f --filter "label=com.docker.compose.project=$project" || true
  fi

  if [ "$GC" -eq 1 ]; then
    say "Entferne taglose Images und Build-Cache älter als ${GC_UNTIL}h …"
    docker image prune -f --filter "until=${GC_UNTIL}h" || true
    docker builder prune -f --filter "until=${GC_UNTIL}h" || true
  elif [ "$MODE" = cleanup ] || [ -z "$project" ]; then
    say 'Mehr Aufräumen: sh scripts/update.sh --gc — zusätzlich taglose Images'
    say 'und Build-Cache älter als STOERDESK_GC_UNTIL Stunden (Standard 168).'
  fi
}

if [ "$MODE" != cleanup ]; then
  local_version=$(tr -d '[:space:]' <VERSION 2>/dev/null || true)
  latest=$(remote_version)

  say "Lokal:  ${local_version:-unbekannt}"
  say "GitHub: $latest"

  if [ "$MODE" = check ]; then
    if [ -n "$local_version" ] && [ "$local_version" = "$latest" ]; then
      say 'Der Server ist bereits auf der neuesten Version.'
      exit 0
    fi

    say "Update verfügbar: $latest"
    exit 0
  fi

  if [ -n "$local_version" ] && [ "$local_version" = "$latest" ]; then
    say 'Der Server ist bereits auf der neuesten Version.'
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
      IMAGE_BUILD_CONTEXT="${STOERDESK_BUILD_CONTEXT:-https://github.com/$REPO_SLUG.git#main}"
      export IMAGE_BUILD_CONTEXT
      say "IMAGE_BUILD_CONTEXT zeigt auf keine Git-URL — baue aus $IMAGE_BUILD_CONTEXT."
    fi
  fi
fi

require_compose
detect_project

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

# The snapshot before the rebuild: it is the only place the images of the previous
# build can be found, because the rebuild leaves them without a name.
captured=$(own_ids)

if [ "$MODE" = cleanup ]; then
  say 'Räume nur die Images auf (kein Pull, kein Build) …'
  clean_images
  exit 0
fi

say 'Baue den Stack neu …'
built=1
# shellcheck disable=SC2086
compose "$@" $profiles --project-directory "$ROOT_DIR" \
  -f "$ROOT_DIR/docker-compose.yml" up -d --build --remove-orphans || built=0

# The clean-up also runs after a failed rebuild: the attempt already moved the
# `:latest` tags and left its previous image tagless on the host.
clean_images

if [ "$built" -ne 1 ]; then
  say 'Der Build ist fehlgeschlagen; die laufende Version bleibt die bisherige.'
  die 'docker compose up failed'
fi

say "Fertig. Version auf dem Server: $(tr -d '[:space:]' <VERSION 2>/dev/null || printf 'unbekannt')"
