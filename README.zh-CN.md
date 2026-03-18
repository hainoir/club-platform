# Club Platform（中文说明）

[English](./README.md) | [简体中文](./README.zh-CN.md)

这是一个基于 Next.js 15 + Supabase 的社团管理平台，覆盖值班流程、活动管理、成员管理等核心场景。

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

PowerShell 可使用：

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
2. 把新 key 更新到本地 `.env.local`。
3. 更新 GitHub Actions Secrets：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`E2E_MEMBER_EMAIL`、`E2E_MEMBER_PASSWORD`、`E2E_ADMIN_EMAIL`、`E2E_ADMIN_PASSWORD`、`E2E_KEY_RECEIVER_EMAIL`、`E2E_KEY_RECEIVER_PASSWORD`。
4. 重新跑 CI，确认 smoke 和 full E2E 均执行。

## 质量门禁
本地建议执行：

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run e2e:smoke
pnpm run e2e --reporter=line
```

CI 流程与本地一致：先执行 smoke，再执行 full E2E。
