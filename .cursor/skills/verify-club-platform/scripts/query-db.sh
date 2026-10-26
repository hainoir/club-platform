#!/usr/bin/env bash
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$HERE/common.sh"

sql="${1:-}"
if [[ -z "$sql" ]]; then
  die "Usage: query-db.sh \"select ...\""
fi

psql_query "$sql"
