#!/bin/sh
# StörDesk ntfy setup (WP-M14-70, ADR-0024 points 3 and 6).
#
#   npm run ntfy:setup          # same as: sh scripts/ntfy-setup.sh
#
# Creates the access control list of the optional `ntfy` Compose profile
# (WP-M14-69, `ntfy/server.yml`) inside the running ntfy container and hands
# the API user its token:
#
#   - refuses while the ntfy container is not running or while
#     `auth-default-access` is not `deny-all` — the ACL rule of ADR-0024
#     requires that deny-all base, so the script never widens a looser server
#   - creates the user `stoerdesk-api` with role `user` when it is missing
#   - grants `stoerdesk-api` read-write on the topic prefix `stoerdesk-*` and
#     `everyone` read-only on it — the anonymous read entry is what lets a
#     phone subscribe through the QR code without a login (ADR-0024 point 6)
#   - creates one access token and writes it into `.env` as `NTFY_TOKEN`, but
#     only while that key is empty: an existing token is never overwritten and
#     its value is never printed to the terminal or written to a log
#     (ADR-0024 consequence: the token is a secret of the same class as
#     `POSTGRES_PASSWORD`)
#
# Every command is idempotent: running the script again changes nothing.
# No change of the ntfy server configuration itself (that is WP-M14-69) and
# none of the API, which reads `NTFY_TOKEN` through the channel configuration.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

env_file=.env
api_user=stoerdesk-api
topic_pattern='stoerdesk-*'
ntfy_service=ntfy

say() { printf '%s\n' "$*"; }
die() {
  printf 'ntfy setup: %s\n' "$*" >&2
  exit 1
}

ntfy() {
  docker compose --profile ntfy exec --no-tty "$ntfy_service" ntfy "$@"
}

if ! docker info >/dev/null 2>&1; then
  die 'no usable Docker daemon'
fi

if [ ! -f "$env_file" ]; then
  die 'the deployment needs .env first: run npm run env:create'
fi

if ! ntfy config check >/dev/null 2>&1; then
  die 'the ntfy container is not running — start the profile first: docker compose --profile ntfy up'
fi

default_access=$(ntfy config read auth-default-access 2>/dev/null || true)
if [ "$default_access" != deny-all ]; then
  die 'auth-default-access is not deny-all — the read-only mount of ntfy/server.yml of WP-M14-69 must stay in place'
fi

if ntfy user list 2>/dev/null | grep -q "$api_user"; then
  say "user $api_user exists — kept"
else
  ntfy user add --role=user "$api_user" >/dev/null
  say "created user $api_user (role user)"
fi

ntfy access "$api_user" "$topic_pattern" read-write >/dev/null
ntfy access everyone "$topic_pattern" read-only >/dev/null
say "access control list set: $api_user read-write and everyone read-only on $topic_pattern"

if ! grep -q '^NTFY_TOKEN=' "$env_file"; then
  die 'no NTFY_TOKEN key in .env — add the key of .env.example and run this script again'
fi

current_token=$(sed -n '/^NTFY_TOKEN=/s/^NTFY_TOKEN=//p' "$env_file" | head -n 1)

if [ -n "$current_token" ]; then
  say 'NTFY_TOKEN already set in .env — kept, its value is never printed'
  exit 0
fi

token=$(ntfy token add "$api_user" 2>/dev/null | sed -n 's/.*\(tk_[^[:space:]]*\).*/\1/p' | head -n 1)

case "$token" in
  tk_*) ;;
  *) die 'the token could not be read back from ntfy — nothing was written to .env' ;;
esac

sed -i "s|^NTFY_TOKEN=.*|NTFY_TOKEN=$token|" "$env_file"
say 'created the access token of stoerdesk-api and wrote it into .env as NTFY_TOKEN (value never printed)'
