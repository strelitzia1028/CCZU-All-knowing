# CCZU All-knowing

CCZU All-knowing 校园生活 Agent。项目采用前后端分离的 pnpm workspace。

当前 ECS 部署地址：http://47.117.124.120

ECS 运维说明见 [deploy/ECS.md](deploy/ECS.md)。

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
TEST_USER_PASSWORD=
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
普通用户需要注册并登录，只能访问公开页面和普通用户 API。

### 普通用户账号

- 注册字段：用户名、昵称、密码
- 用户名为 3 到 32 位字母、数字或下划线
- 密码至少 8 个字符
- 密码使用 Node.js `scrypt` 加盐哈希保存
- 登录会话使用 HMAC 签名 Token
- 普通用户不能调用管理员写接口

### 信息源类型

管理员可在 `/admin/source-types/` 集中维护发布类型。类型代码创建后不可修改；
发布表单只显示启用类型。已有信息源使用的类型只能停用，不能永久删除。

### Agent 与信息源

聊天页采用受控 Agent 编排，而不是让模型直接操作数据库：

1. 模型理解任务并选择受控工具。
2. 前端把最近 12 条本地对话作为临时上下文提交，后端不持久化对话内容。
3. Agent 先结合上下文总结完整需求，再依据 Tag 描述和类型描述核对分类。
4. 后端检索已审核知识库和社区信息源，使用 Tag、关键词、时间、地点和人数
   进行加权评分；低于阈值时最多重算 3 轮，全部失败则返回
   “无法找到匹配项，请减少限定词”。
5. 对找搭子、求购、招领等发布需求，Agent 生成或修订待确认草稿。
6. 缺失的 Tag 和信息源类型进入目录申请，由管理员在审核后台分类处理。
7. 用户确认后先保存为草稿，再单独确认提交管理员审核。
8. Agent 不会自动发布、自动审核或直接执行 SQL。

模糊词排除表位于 `backend/src/search-exclusions.ts`，用于降低“我、要、找、
一个、发布、信息”等泛词对检索和 Tag 提取的干扰。硬性时间、地点、人数条件
不会在检索重试中被丢弃。

对话记录按登录用户保存在浏览器 `localStorage`，不会写入 PostgreSQL。
除非用户主动点击“清空对话”，刷新页面或重新登录后仍会恢复本机记录。

信息源支持今天、本周、本月、本年、所有五种发布时间范围，以及多 Tag
筛选。筛选多个 Tag 时，信息源匹配其中任意一个即可显示。管理员可在信息源
详情中将审核通过的内容转存到知识库；同一条信息源只能转存一次。

信息源作者可在发布时选择是否开放公开讨论。开启后卡片显示绿色“可回复”，
用户可以在详情中公开评论。所有信息源均支持仅双方可见的私聊，第三方无法
读取私聊内容。

知识库管理页对管理员展示全部审核状态，并单独统计、筛选示例数据。通过信息源
转存的知识条目会保留 `source_id` 来源关联。

知识库填写与信息源发布共用 AI 分类能力：系统先总结标题和正文，再依据 Tag
描述与信息源类型描述自动选择 Tag 和类型。信息源转存知识库时保留原类型。

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

1. 智谱规划器判断是普通咨询、发布需求还是普通问候。
2. 后端调用 `search_knowledge` 检索已审核知识。
3. 后端调用 `search_sources` 检索已审核社区信息源。
4. 对发布需求调用 `prepare_source_draft`，只返回待确认草稿。
5. 智谱基于检索结果生成回答，禁止编造资料外信息。
6. 前端流式显示回答、工具执行轨迹、匹配信息源和草稿确认卡。
