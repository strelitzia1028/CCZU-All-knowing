# CCZU Backend

Express API for the CCZU All-knowing project.

- Development port: `4000`
- Database: PostgreSQL
- Model provider: Zhipu OpenAI-compatible API
- Health check: `GET /api/health`

The backend loads database configuration from the repository root `.env.local`
and model API configuration from the repository root `.env.models`.

```powershell
pnpm dev
pnpm db:init
pnpm build
pnpm start
```
