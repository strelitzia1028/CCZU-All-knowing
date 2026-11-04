# CCZU All-knowing

常州大学西太湖校区生活互助智能体。项目采用前后端分离的 pnpm workspace。

## 项目结构

```text
frontend/   Next.js 前端，构建为纯静态文件
backend/    Express API、PostgreSQL、智谱模型调用
shared/     前后端共享 TypeScript 类型
drizzle/    PostgreSQL 表结构迁移（位于 backend）
```

## 本地启动

根目录 `.env.local` 只保存数据库和服务配置：

```dotenv
DATABASE_URL=postgresql://postgres:password@localhost:5432/cczu
DATABASE_SSL=false

BACKEND_PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
ADMIN_PASSWORD=
SESSION_SECRET=
```

根目录 `.env.models` 单独保存模型 API 配置：

```dotenv
CHAT_API_KEY=
CHAT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
CHAT_MODEL=glm-4-flash-250414
CHAT_TEMPERATURE=0.4
CHAT_TIMEOUT_MS=180000

EXTRACT_API_KEY=
EXTRACT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
EXTRACT_MODEL=glm-4-flash-250414
EXTRACT_TEMPERATURE=0.1
EXTRACT_TIMEOUT_MS=60000
```

`.env.models` 已被 Git 忽略。回答模型和标签提取模型可以分别填写不同的服务商。

管理员入口还需要在 `.env.local` 中配置：

```dotenv
ADMIN_PASSWORD=你的管理员密码
SESSION_SECRET=至少32字节的随机字符串
```

管理员登录后由后端签发 HMAC Token，所有管理 API 都会在服务端校验该 Token。
普通用户无需密码，只能访问公开页面和普通用户 API。

`frontend/.env.local`：

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

安装、初始化数据库并启动：

```powershell
pnpm install
pnpm db:init
pnpm dev
```

访问：

- 前端：http://localhost:3000
- 后端健康检查：http://localhost:4000/api/health

## 数据库

```powershell
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm db:init
```

数据库结构位于 `backend/src/database/schema.ts`，迁移位于
`backend/drizzle/`。种子数据包含管理员、普通用户和四个基础 Tag。

## OpenClaw 前端部署

构建前设置生产 API 地址：

```powershell
cd frontend
$env:NEXT_PUBLIC_API_BASE_URL="https://api.example.com"
pnpm build
```

将 `frontend/out/` 中的全部文件上传到 OpenClaw 的静态站点目录。后端需在
`.env.local` 中把 `FRONTEND_ORIGIN` 设置为 OpenClaw 前端域名。

## 问答链路

1. 智谱从问题中提取 1 至 5 个标签。
2. PostgreSQL 按标签和关键词粗筛已审核知识。
3. 后端计算标签交集匹配度，过滤低于 30% 的结果并取前 3 条。
4. 智谱基于检索资料生成回答，禁止编造资料外信息。
5. 前端流式显示回答、提取标签、来源和匹配度。
