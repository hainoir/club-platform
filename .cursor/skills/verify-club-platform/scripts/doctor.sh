#!/usr/bin/env bash
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$HERE/common.sh"

load_state

ok=1
note() {
  printf '%s\n' "$1"
}
bad() {
  printf 'FAIL %s\n' "$1"
  ok=0
}

if [[ ! -f "$STATE_FILE" ]]; then
  bad "no run state. This stack was not started by launch.sh."
else
  note "state: present"
fi

if [[ -z "${LISTENER_PID:-}" ]]; then
  bad "LISTENER_PID is missing"
elif ! kill -0 "$LISTENER_PID" 2>/dev/null; then
  bad "next listener ${LISTENER_PID} is not running"
else
  cmdline=$(tr '\0' ' ' <"/proc/${LISTENER_PID}/cmdline")
  if [[ "$cmdline" == *"next-server"* ]]; then
    note "next: listener ${LISTENER_PID} on port ${APP_PORT}"
  else
    bad "pid ${LISTENER_PID} is not next-server"
  fi
fi

if curl -fsS "$APP_URL/login" | grep -q '技术中心签到系统'; then
  note "login: ${APP_URL}/login shows 技术中心签到系统"
else
  bad "login page is not usable at ${APP_URL}/login"
fi

if [[ -f "$DB_URL_FILE" ]]; then
  fence=$(psql_query "select count(*) from public.studio_geofence" || true)
  member=$(psql_query "select count(*) from auth.users where email = 'e2e.member@club.local'" || true)
  if [[ "$fence" == "1" && "$member" == "1" ]]; then
    note "db: studio_geofence=1 seeded member=1"
  else
    bad "db check failed (studio_geofence=${fence:-missing} member=${member:-missing})"
  fi
  api_code=$(curl -s -o /dev/null -w '%{http_code}' "${APP_URL}/api/auth/session" || true)
  note "session route: HTTP ${api_code}"
else
  bad "database URL file is missing"
fi

if [[ -f "$ROOT/.env.local" ]] && grep -q '^NEXT_PUBLIC_SUPABASE_ANON_KEY=.\+' "$ROOT/.env.local"; then
  note "env: anon key is set and was not printed"
else
  bad ".env.local is missing a non-empty anon key. next build inlines this value, so rebuild after writing it."
fi

if [[ "$ok" -ne 1 ]]; then
  exit 1
fi
note "doctor: ok"
