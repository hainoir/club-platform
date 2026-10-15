#!/usr/bin/env bash
set -euo pipefail
set -m

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$HERE/common.sh"

started_supabase=0
next_pid=""

fail_cleanup() {
  local status=$?
  if [[ "$status" -eq 0 ]]; then
    return
  fi
  printf 'launch failed (exit %s). Stopping only what this attempt started.\n' "$status" >&2
  STARTED_SUPABASE=$started_supabase NEXT_PID=$next_pid LISTENER_PID=${listener_pid:-} "$HERE/cleanup.sh" || true
  exit "$status"
}
trap fail_cleanup EXIT

mkdir -p "$RUN_DIR" "$EVIDENCE_DIR"

if [[ -f "$STATE_FILE" ]]; then
  die "A verification run state already exists at $STATE_FILE. Run cleanup.sh before launch.sh."
fi

command -v supabase >/dev/null || die "supabase CLI is not on PATH. CI uses 2.121.0."
command -v docker >/dev/null || die "docker is not on PATH."
docker info >/dev/null 2>&1 || die "docker is installed but the daemon is not reachable."
command -v pnpm >/dev/null || die "pnpm is not on PATH."
command -v psql >/dev/null || die "psql is not on PATH."

if port_open "$APP_PORT"; then
  die "Port ${APP_PORT} is already open. Refusing to start a second Next server."
fi

for port in "${SUPABASE_PORTS[@]}"; do
  if port_open "$port"; then
    die "Port ${port} is already open. Refusing to start a second Supabase stack."
  fi
done

existing=$(project_containers)
if [[ -n "$existing" && "${VERIFY_ALLOW_RESET:-}" != "1" ]]; then
  die "Supabase containers for club-platform already exist. Refusing to reset them. Stop that stack yourself, or set VERIFY_ALLOW_RESET=1 if you mean to wipe it."
fi

cd "$ROOT"

if [[ -f "$ROOT/.env.local" ]]; then
  cp "$ROOT/.env.local" "$ENV_BACKUP"
fi

# Match .github/workflows/ci.yml. The full `supabase start` also boots Realtime,
# and that container's own migration exits 1 when it cannot borrow a database
# connection during startup. This app does not subscribe to Realtime.
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,mailpit
started_supabase=1
pnpm run db:reset

supabase status -o env >"$RUN_DIR/supabase.env"
set -a
# shellcheck disable=SC1091
source "$RUN_DIR/supabase.env"
set +a

: "${API_URL:?supabase status did not print API_URL}"
: "${ANON_KEY:?supabase status did not print ANON_KEY}"
: "${DB_URL:?supabase status did not print DB_URL}"

umask 077
cat >"$ROOT/.env.local" <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
NEXT_PUBLIC_ENABLE_WEB_VITALS_DEBUG=false
E2E_MEMBER_EMAIL=e2e.member@club.local
E2E_MEMBER_PASSWORD=e2e-member-pass
E2E_ADMIN_EMAIL=e2e.admin@club.local
E2E_ADMIN_PASSWORD=e2e-admin-pass
E2E_KEY_RECEIVER_EMAIL=e2e.receiver@club.local
E2E_KEY_RECEIVER_PASSWORD=e2e-receiver-pass
EOF
printf '%s\n' "$DB_URL" >"$DB_URL_FILE"
chmod 600 "$ROOT/.env.local" "$DB_URL_FILE" "$RUN_DIR/supabase.env"

pnpm exec next build
nohup pnpm exec next start --hostname 127.0.0.1 --port "$APP_PORT" >>"$EVIDENCE_DIR/next.log" 2>&1 < /dev/null &
next_pid=$!

ready=0
listener_pid=""
for _ in $(seq 1 60); do
  if curl -fsS "$APP_URL/login" | grep -q '技术中心签到系统'; then
    listener_pid=$(ss -ltnp "sport = :${APP_PORT}" | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
    if [[ -n "$listener_pid" ]]; then
      ready=1
      break
    fi
  fi
  if ! kill -0 "$next_pid" 2>/dev/null; then
    die "next start exited before the login page was usable. See $EVIDENCE_DIR/next.log"
  fi
  sleep 2
done
[[ "$ready" -eq 1 ]] || die "Login page did not become usable. See $EVIDENCE_DIR/next.log"

fence_count=$(psql_query "select count(*) from public.studio_geofence")
member_count=$(psql_query "select count(*) from auth.users where email = 'e2e.member@club.local'")
[[ "$fence_count" == "1" ]] || die "studio_geofence row count is ${fence_count}, expected 1."
[[ "$member_count" == "1" ]] || die "Seeded member is missing from auth.users."

cat >"$STATE_FILE" <<EOF
STARTED_SUPABASE=1
NEXT_PID=${next_pid}
LISTENER_PID=${listener_pid}
APP_URL=${APP_URL}
EOF
chmod 600 "$STATE_FILE"

trap - EXIT
printf 'ready %s\n' "$APP_URL"
