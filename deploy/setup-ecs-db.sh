#!/usr/bin/env bash
set -euo pipefail

: "${DB_PASSWORD:?DB_PASSWORD is required}"

DB_NAME="cczu"
DB_USER="cczu_app"

if ! sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres createuser "${DB_USER}"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}'"

if ! sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi

sudo -u postgres psql -tAc \
  "SELECT datname, pg_catalog.pg_get_userbyid(datdba)
   FROM pg_database
   WHERE datname='${DB_NAME}'"
