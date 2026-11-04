# AGENTS.md

## Architecture

- `frontend/`: Next.js static-export UI. It must not import PostgreSQL or Zhipu SDK code.
- `backend/`: Express API, PostgreSQL queries, session handling and Zhipu calls.
- `shared/`: cross-application TypeScript contracts only.
- Root `.env.local`: database and backend service configuration.
- Root `.env.models`: model API credentials and model names. Never commit it.
- `frontend/.env.local`: public API base URL only.

## Rules

- Keep secrets out of source files and client bundles.
- Admin APIs must require a valid HMAC-signed bearer token.
- Use parameterized PostgreSQL queries.
- Keep API paths stable between frontend and backend.
- Run `pnpm ts-check` and `pnpm build` after structural changes.
- The frontend build output is `frontend/out`.
