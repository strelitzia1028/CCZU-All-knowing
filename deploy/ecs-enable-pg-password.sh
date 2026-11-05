#!/usr/bin/env bash
set -euo pipefail

PG_HBA="/var/lib/pgsql/data/pg_hba.conf"

if [[ ! -f "${PG_HBA}.cczu-backup" ]]; then
  cp "${PG_HBA}" "${PG_HBA}.cczu-backup"
fi

sed -i \
  -e '/^host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+127\.0\.0\.1\/32[[:space:]]\+ident/c\host    all             all             127.0.0.1/32            scram-sha-256' \
  -e '/^host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+::1\/128[[:space:]]\+ident/c\host    all             all             ::1/128                 scram-sha-256' \
  "${PG_HBA}"

systemctl reload postgresql
grep -nE '^(host[[:space:]]+all[[:space:]]+all)' "${PG_HBA}"
