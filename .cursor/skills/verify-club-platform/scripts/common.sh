#!/usr/bin/env bash

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
ARTIFACTS="$ROOT/.verification-artifacts"
RUN_DIR="$ARTIFACTS/run"
EVIDENCE_DIR="$ARTIFACTS/evidence"
STATE_FILE="$RUN_DIR/state.env"
DB_URL_FILE="$RUN_DIR/db.url"
ENV_BACKUP="$RUN_DIR/env.local.bak"
APP_URL="http://127.0.0.1:3001"
APP_PORT=3001

SUPABASE_PORTS=(54320 54321 54322 54323 54324 54327)

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

port_open() {
  local port="$1"
  timeout 1 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1
}

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
  fi
}

project_containers() {
  docker ps -a --format '{{.Names}}' | grep -E 'club-platform' || true
}

psql_query() {
  local sql="$1"
  [[ -f "$DB_URL_FILE" ]] || die "No database URL. Run launch.sh first."
  local db_url
  db_url=$(<"$DB_URL_FILE")
  psql "$db_url" -v ON_ERROR_STOP=1 -At -c "$sql"
}
