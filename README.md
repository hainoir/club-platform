# 社团管理平台

[主说明](./README.md) | [补充中文说明](./README.zh-CN.md)

这是一个基于 Next.js 15 + Supabase 的社团管理平台，覆盖值班流程、活动管理、成员管理等核心场景。

## 项目摘要

本项目不是静态后台页面，而是一个围绕登录态、权限、排班和审批流构建的校园社团运营系统。最值得展示的工程链路包括：

- 基于 App Router 和 Supabase SSR 的首页服务端数据聚合。
- 中间件、provider 组件与 Zustand 之间的登录态和用户状态同步。
- 带定位校验与重复签到防护的值班签到。
- 审批制请假、代班、补班日期和钥匙交接流程。
- 与值班签到分离的 `studio_sessions` 自习在场记录，以及对应的 RPC 清理边界。
- Playwright 覆盖受保护流程、值班操作、成员搜索、自习、通知、设置和活动报名等关键路径。
- 可安装 PWA 与标准 VAPID Web Push，支持关键值班和工作流手机系统通知。

推荐深入阅读：

- [架构说明](./docs/architecture.md)
- [值班流程契约](./docs/duty-contract.md)
- [Supabase RPC 检查清单](./docs/supabase-rpc-checklist.md)
- [PWA Web Push 部署与运维](./docs/web-push.md)

## 技术栈
- Next.js App Router
- React 19 + TypeScript
- Supabase（Auth、Database、Storage）
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

## 环境配置
本地至少需要配置：

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

手机系统通知还需要 Service Role、VAPID 和 Dispatcher 变量，完整配置见 [PWA Web Push 部署与运维](./docs/web-push.md)。

可选的 E2E 账号变量请参考 `.env.example`。

## 部署流程

本仓库采用基于 Git 的 Vercel 工作流：

- `main` 是生产分支。
- 非 `main` 分支和拉取请求应部署到 Vercel Preview。
- 只有在 Preview 链接验证通过后，才合并到 `main`。

请在 `Preview` 和 `Production` 两个环境中都配置以下 Vercel 环境变量：

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

如果预览部署需要受保护流程测试，可再补充可选的 `E2E_*` 变量。

推荐发布步骤：

1. 从 `main` 切出功能分支。
2. 推送分支并打开对应的 Vercel Preview 链接。
3. 验证预览环境行为和持续集成状态。
4. 合并到 `main` 以触发生产部署。

不要提交 `.vercel` 或 `.env*.local` 文件。

## 安全加固说明（发布前检查）

### 本地环境文件
- `.env.local` 仅用于本地，禁止提交。
- `.gitignore` 已包含 `.env*.local`。
- 用以下命令确认 `.env.local` 未被追踪：

```bash
git ls-files .env.local
```

期望结果：无输出。

### 密钥暴露后的轮换
如果密钥曾被提交过，就应视为已暴露，并在发布前完成轮换。

最低必做项：
1. 在 Supabase 项目设置中轮换 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
2. 用新密钥替换本地 `.env.local` 中的值。
3. 更新 GitHub Actions 仓库密钥：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `E2E_MEMBER_EMAIL`
   - `E2E_MEMBER_PASSWORD`
   - `E2E_ADMIN_EMAIL`
   - `E2E_ADMIN_PASSWORD`
   - `E2E_KEY_RECEIVER_EMAIL`
   - `E2E_KEY_RECEIVER_PASSWORD`
4. 重新运行持续集成，确认 lint、typecheck、单元测试、smoke E2E 和只读 E2E 都已执行。
5. 只有在需要验证真实写入路径时，才在隔离的 Supabase 环境中运行 `pnpm run e2e:mutation`。

## 质量门禁
本地建议执行：

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run e2e:smoke
pnpm run e2e:readonly
```

`pnpm run e2e:mutation` 仅适用于隔离环境，因为它会覆盖审批、报名、签到、自习和资料修改等真实写入路径。
