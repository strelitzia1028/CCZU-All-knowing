#!/usr/bin/env bash
set -euo pipefail

: "${1:?username is required}"

if [[ ! "$1" =~ ^[a-z0-9_]+$ ]]; then
  echo "Invalid username" >&2
  exit 1
fi

set -a
source /opt/cczu/.env.local
set +a

psql "${DATABASE_URL}" \
  -v ON_ERROR_STOP=1 \
  -c "DELETE FROM profiles WHERE username = '$1';"
