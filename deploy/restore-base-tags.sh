#!/usr/bin/env bash
set -euo pipefail

set -a
source /opt/cczu/.env.local
set +a

psql "${DATABASE_URL}" \
  -v ON_ERROR_STOP=1 \
  -f /opt/cczu/deploy/restore-base-tags.sql

psql "${DATABASE_URL}" \
  -c "SELECT name, description, status FROM tags ORDER BY created_at"
