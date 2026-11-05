# ECS Deployment

## Public URL

http://47.117.124.120

## Server layout

- Frontend static files: `/var/www/cczu/frontend`
- Backend and deployment files: `/opt/cczu`
- Database: PostgreSQL 15, database `cczu`, user `cczu_app`
- Nginx config: `/etc/nginx/conf.d/cczu.conf`
- Backend service: `/etc/systemd/system/cczu-backend.service`

## Services

```bash
systemctl status cczu-backend
systemctl restart cczu-backend
journalctl -u cczu-backend -f

systemctl status nginx
systemctl status postgresql
```

## Security boundaries

- Public: TCP 22 and 80
- Internal only: backend `127.0.0.1:4000`
- Internal only: PostgreSQL `127.0.0.1:5432`
- Secrets: `/opt/cczu/.env.local` and `/opt/cczu/.env.models`, mode `600`
- User registration: `/api/auth/register`
- User login: `/api/auth/login`
- Admin login: `/api/auth/admin-login`

## Update frontend

Build with same-origin API:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="same-origin"
pnpm --filter @cczu/frontend build
```

Overlay `frontend/out/` into `/var/www/cczu/frontend` without deleting older
hashed `_next/static` files. Do not replace the directory for every release:

```bash
cp -a /path/to/frontend/out/. /var/www/cczu/frontend/
```

Keeping old chunks prevents an already-open page from referencing a hashed
JavaScript file that disappeared during deployment.
The web server must be able to traverse every directory:

```bash
find /var/www/cczu/frontend -type d -exec chmod 755 {} +
find /var/www/cczu/frontend -type f -exec chmod 644 {} +
```

## Update backend

```powershell
pnpm --filter @cczu/backend build
```

Upload `backend/dist/` to `/opt/cczu/backend/dist`, then:

```bash
chown -R cczu:cczu /opt/cczu/backend/dist
systemctl restart cczu-backend
```
