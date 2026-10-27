# REVIEW.md

For adversarial review of **this PR's diff only**. Goal: catch what can go wrong, not nit every line.

## Failure modes (what "bad" looks like here)

- **Auth / session**: unauthenticated or wrong-role access to admin/member data; cookie/session refresh broken; middleware bypass.
- **RLS / RPC**: policy widened or missing; `SECURITY DEFINER` RPC that trusts client input; server using service role where anon/user client belongs.
- **Data integrity**: writes that skip audit/soft-delete rules; timezone/instant stored as wall-clock without zone; leaking PII in logs or client payloads.
- **CI / deps**: workflow secrets exposed; lockfile drift; Dependabot major that breaks build.
- **Docs**: instructions that lie about commands, env, or deploy steps.

## Sensitive paths (High by default — kir must explicitly approve)

Edits on these paths are **High**. A docs-only change inside these trees can still be Low. Do not class them as Medium.

- `supabase/migrations/**`, `database/**`
- `middleware.ts`, `utils/supabase/**`, `app/api/auth/**`
- `.github/workflows/**`
- `.env*`, any secret or service-role usage
- Production project `qpdbjizsccvebfqozmal` (apply / restore / pause) — **kir must approve**; Grok Bot does not change it

## Skip / de-emphasize

- Pure formatting, import order, rename-only churn
- Pre-existing issues outside the diff (tag Pre-existing, do not block)
- Style preferences already covered by lint/prettier

## Reviewer rules

1. Only findings that affect **correctness, security, or user-visible breakage**. Cap nits (at most 2, labeled Nit).
2. Every finding: **file + line**, severity `Important` | `Nit` | `Pre-existing`, and one sentence on what breaks.
3. Summary first line: `N findings (I important, N nits)` or `0 findings — nothing to fix`.
4. Do not re-report the same class after the author fixed it once; if still wrong after **3** review↔fix rounds, stop and ask for a different approach.

## Verify before "done" (author pastes command + output)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Touching auth/duty/studio/events/RLS: also run the relevant Playwright subset (`pnpm e2e:smoke` or `e2e:readonly` / `e2e:mutation` as fits). Migrations: state how they were applied (local reset vs prod) and that prod was kir-approved.

## Risk → human gate

| Risk | Examples | Gate |
|------|----------|------|
| Low | docs, copy, additive behind a flag | bot verify + adversarial review green → may merge |
| Medium | ordinary product UI/API, excluding the Sensitive paths list: prod Supabase, auth/session routes (`app/api/auth/**`), middleware, `utils/supabase/**`, secrets, CI workflows, migrations, and `database/**` | kir sees evidence (commands, review summary) |
| High | prod Supabase, auth/session routes (`app/api/auth/**`), middleware, `utils/supabase/**`, secrets, CI workflows, migrations, and `database/**` | kir must explicitly approve |

Bot approval never counts as kir's.
