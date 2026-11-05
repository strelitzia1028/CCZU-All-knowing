#!/usr/bin/env bash
set -euo pipefail

set -a
source /opt/cczu/.env.local
set +a

psql "${DATABASE_URL}" \
  -v ON_ERROR_STOP=1 \
  -f /opt/cczu/backend/drizzle/0000_safe_hemingway.sql

cd /opt/cczu/backend
node dist/database/seed.js
