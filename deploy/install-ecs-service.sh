#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="$(command -v node)"

if ! id cczu >/dev/null 2>&1; then
  useradd --system --home /opt/cczu --shell /sbin/nologin cczu
fi

chown -R cczu:cczu /opt/cczu
chmod 600 /opt/cczu/.env.local /opt/cczu/.env.models

install -d -m 0755 -o root -g nginx /var/www/cczu/frontend
cp -a /opt/cczu/frontend/out/. /var/www/cczu/frontend/
chown -R root:nginx /var/www/cczu/frontend
find /var/www/cczu/frontend -type d -exec chmod 0755 {} +
find /var/www/cczu/frontend -type f -exec chmod 0644 {} +

cat >/etc/systemd/system/cczu-backend.service <<EOF
[Unit]
Description=CCZU All-knowing Backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=cczu
Group=cczu
WorkingDirectory=/opt/cczu/backend
ExecStart=${NODE_BIN} /opt/cczu/backend/dist/server.js
Environment=NODE_ENV=production
Restart=always
RestartSec=3
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

install -m 0644 /opt/cczu/deploy/nginx-cczu.conf \
  /etc/nginx/conf.d/cczu.conf

if [[ -f /etc/nginx/conf.d/default.conf ]]; then
  mv /etc/nginx/conf.d/default.conf \
    /etc/nginx/conf.d/default.conf.disabled
fi

systemctl daemon-reload
systemctl enable cczu-backend
systemctl restart cczu-backend
nginx -t
systemctl enable nginx
systemctl restart nginx

sleep 2
systemctl --no-pager --full status cczu-backend | head -20
ss -lntp | grep -E ':(80|4000)\b' || true
