# 贡献指南

## 分支与部署

- 所有变更都应使用功能分支。
- 分支和拉取请求的验证应使用 Vercel Preview 部署。
- `main` 仅用于在 Vercel 上发布生产版本。

## 发布流程

1. 从 `main` 切出分支。
2. 完成修改并创建拉取请求。
3. 验证 Vercel Preview 部署和 GitHub Actions 质量门禁。
4. 只有在预览验证通过后，才合并到 `main`。

## 必需的 Vercel 环境变量

请在 `Preview` 和 `Production` 两个环境中都设置以下变量：

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

只有在预览环境或持续集成流程需要带登录态的端到端验证时，才额外添加可选的 `E2E_*` 变量。

## 本地安全规则

- 不要提交 `.env*.local`。
- 不要提交 `.vercel`。
- 条件允许时，请在合并前运行本地质量门禁：

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run e2e:smoke
pnpm run e2e:readonly
```

`pnpm run e2e:mutation` 只能在隔离的 Supabase 环境中运行，因为这些用例会覆盖真实写入路径。
