# 社团管理平台（前端实习版中文说明）

[主说明](./README.md) | [中文说明](./README.zh-CN.md)

这是一个基于 Next.js 15、React 19 和 Supabase 的校园社团运营系统。它不是“静态后台页面集合”，而是围绕登录态、权限、排班、审批、签到和自习记录构建的多步骤业务工作流。

如果把它作为前端实习项目来讲，最有价值的主线不是“功能很多”，而是下面几条工程链路：

- App Router 下的服务端布局、受保护布局和客户端 Provider 边界。
- Supabase SSR、中间件、客户端 store 之间的登录态同步。
- 首页服务端数据聚合与仪表盘强交互拆分。
- 带定位校验、重复签到保护和数据库唯一约束的值班签到。
- 请假、代班、补班、钥匙交接组成的状态流转。
- 值班签到和工作室自习分表建模，并通过 RPC 清理过期会话。
- Playwright 覆盖登录保护、值班、自习、设置、活动报名和成员管理关键路径。

## 项目定位

这个项目适合被描述成：

- 一个面向校园社团的运营工作流系统。
- 一个体现前端状态管理、服务端/客户端边界和复杂交互拆分的 Next.js 项目。
- 一个有明确数据库契约和端到端验证意识的前端作品。

不建议把它描述成：

- 通用 SaaS 平台。
- 完整的线上生产系统。
- 由前端单独完成所有后端、部署和运维能力的项目。

## 最值得讲的前端工程点

- `App Router + Supabase SSR`：把首屏鉴权和数据聚合留在服务端，把需要浏览器能力的逻辑下放到客户端组件。
- `Auth 同步链`：`middleware`、`AuthProvider`、`AppRouteGuard`、`Zustand store` 共同保证登录态长期一致。
- `服务层聚合`：首页通过 `dashboard-service` 一次并发拉齐排班、签到、请假、成员和当前用户。
- `业务拆钩子`：值班大厅不是一个巨型组件，而是 `useDuty -> 子域 hooks` 的组合。
- `契约意识`：请假与代班共享 `leave_id`，工作室自习通过 `expire_studio_sessions` 统一过期规则。
- `测试意识`：除了 lint/typecheck/build，还有 Playwright 读写路径验证。

## 推荐阅读顺序

1. [项目总览](./docs/project-overview.md)
2. [架构说明](./docs/architecture.md)
3. [值班流程契约](./docs/duty-contract.md)
4. [面试讲稿](./docs/interview-briefing.md)
5. [Supabase RPC 排查清单](./docs/supabase-rpc-checklist.md)

## 文档索引

- [项目总览](./docs/project-overview.md)：项目背景、模块划分、阅读顺序、前端亮点。
- [架构说明](./docs/architecture.md)：请求链路、首页聚合、自习和布局边界。
- [值班流程契约](./docs/duty-contract.md)：请假、代班、补班、钥匙交接和自习相关数据库/RPC 契约。
- [面试讲稿](./docs/interview-briefing.md)：30 秒 / 90 秒 / 3 分钟介绍稿与高频追问。
- [数据库说明](./database/README.md)：数据库脚本目录和用途。

## 技术栈

- Next.js 15 App Router
- React 19 + TypeScript
- Supabase（Auth / Postgres / RLS）
- Zustand
- Tailwind CSS
- Playwright

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

PowerShell 可执行：

```powershell
Copy-Item .env.example .env.local
```

启动后访问 `http://localhost:3000`。

## 环境变量

本地至少需要配置：

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

可选的 E2E 账号变量请参考 `.env.example`。

## 验证命令

建议按下面顺序执行：

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run e2e:smoke
pnpm run e2e --reporter=line
```

如果只是做代码讲解或文档整理，至少应保证 `lint`、`typecheck` 和 `build` 通过。

## 安全与发布前检查

### 本地环境文件

- `.env.local` 仅用于本地，禁止提交到 Git。
- `.gitignore` 已包含 `.env*.local` 规则。
- 用以下命令确认 `.env.local` 未被追踪：

```bash
git ls-files .env.local
```

期望结果：无输出。

### 密钥泄露后的最低处理

如果密钥曾进入 Git 历史，按“已暴露”处理并在发布前完成轮换：

1. 在 Supabase 项目中轮换 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
2. 把新密钥更新到本地 `.env.local`。
3. 更新 GitHub Actions 仓库密钥：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`E2E_MEMBER_EMAIL`、`E2E_MEMBER_PASSWORD`、`E2E_ADMIN_EMAIL`、`E2E_ADMIN_PASSWORD`、`E2E_KEY_RECEIVER_EMAIL`、`E2E_KEY_RECEIVER_PASSWORD`。
4. 重新运行持续集成，确认 smoke 和完整 E2E 均已执行。
