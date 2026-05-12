# 社团管理平台（补充中文说明）

[主说明](./README.md) | [补充中文说明](./README.zh-CN.md)

这是一个基于 Next.js 15 + Supabase 的社团管理平台，覆盖值班流程、活动管理、成员管理等核心场景。

## 作品集摘要

本项目不是静态后台页面，而是一个围绕登录态、权限、排班和审批流构建的校园社团运营系统。项目最适合作为前端实习作品展示的主线是：

- 基于 App Router 和 Supabase SSR 的首页服务端数据聚合。
- 中间件、Provider 组件与 Zustand 之间的登录态与用户状态同步。
- 带定位校验和重复签到约束的值班签到。
- 审批制请假、代班、补班日期和钥匙交接流程。
- 与值班签到分离的工作室自习在场记录，并通过 RPC 收口过期会话清理。
- Playwright 覆盖登录保护、值班操作、成员搜索、自习、通知、设置和活动报名等关键路径。

延伸说明：

- [架构说明](./docs/architecture.md)
- [值班流程契约](./docs/duty-contract.md)

## 技术栈
- Next.js App Router
- React 19 + TypeScript
- Supabase（Auth / Database / Storage）
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

## 安全加固（发布前检查）

### 本地环境文件
- `.env.local` 仅用于本地，禁止提交到 Git。
- `.gitignore` 已包含 `.env*.local` 规则。
- 用以下命令确认 `.env.local` 未被追踪：

```bash
git ls-files .env.local
```

期望结果：无输出。

### 密钥泄露后的轮换
如果密钥曾进入 Git 历史，按“已暴露”处理并在发布前完成轮换。

最低必做项：
1. 在 Supabase 项目中轮换 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
2. 把新密钥更新到本地 `.env.local`。
3. 更新 GitHub Actions 仓库密钥：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`E2E_MEMBER_EMAIL`、`E2E_MEMBER_PASSWORD`、`E2E_ADMIN_EMAIL`、`E2E_ADMIN_PASSWORD`、`E2E_KEY_RECEIVER_EMAIL`、`E2E_KEY_RECEIVER_PASSWORD`。
4. 重新运行持续集成，确认 smoke 和完整 E2E 均已执行。

## 质量门禁
本地建议执行：

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run e2e:smoke
pnpm run e2e --reporter=line
```

持续集成流程与本地一致：先执行 smoke，再执行完整 E2E。
