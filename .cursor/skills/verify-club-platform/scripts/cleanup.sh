#!/usr/bin/env bash
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$HERE/common.sh"

load_state

kill_recorded() {
  local pid="$1"
  local expect="$2"
  [[ -n "$pid" ]] || return 0
  local cmdline=""
  if [[ -r "/proc/${pid}/cmdline" ]]; then
    cmdline=$(tr '\0' ' ' <"/proc/${pid}/cmdline")
  fi
  if [[ "$cmdline" != *"$expect"* ]]; then
    printf 'Leaving pid %s alone. Command does not contain %s.\n' "$pid" "$expect" >&2
    return 0
  fi
  local pgid
  pgid=$(ps -o pgid= -p "$pid" | tr -d ' ')
  if [[ -n "$pgid" && "$pgid" != "$$" ]]; then
    kill -- "-${pgid}" 2>/dev/null || kill "$pid" 2>/dev/null || true
  else
    kill "$pid" 2>/dev/null || true
  fi
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  kill -9 "$pid" 2>/dev/null || true
}

kill_recorded "${LISTENER_PID:-}" "next-server"
kill_recorded "${NEXT_PID:-}" "next start"

if [[ "${STARTED_SUPABASE:-0}" == "1" ]]; then
  cd "$ROOT"
  supabase stop --no-backup
fi

if [[ -f "$ENV_BACKUP" ]]; then
  cp "$ENV_BACKUP" "$ROOT/.env.local"
elif [[ -f "$STATE_FILE" || -f "$DB_URL_FILE" ]]; then
  rm -f "$ROOT/.env.local"
fi

rm -rf "$RUN_DIR"
printf 'cleanup finished. Evidence remains in %s\n' "$EVIDENCE_DIR"
