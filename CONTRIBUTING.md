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

持续集成的 E2E 使用仓库里的本地 Supabase 种子账号，不需要 `E2E_*` 仓库密钥。预览环境如果要手工登录，再按需配置。

## 本地安全规则

- 不要提交 `.env*.local`。
- 不要提交 `.vercel`。
- 合并前的验证命令和风险门禁见下方「合并前审查」。

## 合并前审查

规则全文在 [REVIEW.md](./REVIEW.md)，代理约定在 [AGENTS.md](./AGENTS.md)。每个拉取请求在标成完成前都要跑下面这条，并把命令和输出贴进 PR 说明：

```bash
pnpm verify
# same as: pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

改到登录、值班、自习、活动或 RLS 时，再按改动选跑并贴上输出：`pnpm e2e:smoke`、`pnpm e2e:readonly` 或 `pnpm e2e:mutation`。`e2e:mutation` 只对 `supabase db reset` 后的本地库运行。持续集成里的 E2E job 会自己拉起一次性数据库再跑这组用例。只审本 PR 的 diff：敏感路径默认高风险，`Important` 当场修，审查和修复来回最多 3 轮。

| 风险 | 门禁 |
|------|------|
| 低 | 验证和对抗审查都通过后可以合并。文档、文案、功能开关后的增量改动。 |
| 中 | kir 要看到证据（命令输出和审查摘要）。普通产品界面或接口，且不在高风险路径上。 |
| 高 | 必须 kir 明确同意。生产 Supabase（`qpdbjizsccvebfqozmal`）、登录与会话、`middleware.ts`、`utils/supabase/**`、密钥、CI workflow、迁移、`database/**`。 |

机器人的批准不算 kir 的批准。不要对生产项目执行 apply、restore、pause 或迁移。
