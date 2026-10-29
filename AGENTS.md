# Agent conventions

Every pull request follows [REVIEW.md](./REVIEW.md). Bot approval is not kir's approval. Do not change production Supabase project `qpdbjizsccvebfqozmal` (no apply, restore, pause, or migrations).

## Before done

Run this and paste the command plus its output in the PR description or report:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

If the diff touches auth, duty, studio, events, or RLS, also run and paste the Playwright subset that fits: `pnpm e2e:smoke`, `pnpm e2e:readonly`, and/or `pnpm e2e:mutation`.

When driving the app against a local stack, use [.cursor/skills/verify-club-platform](./.cursor/skills/verify-club-platform/SKILL.md).

## Adversarial review

Review **this PR's diff only**, per REVIEW.md:

- Hunt the failure modes listed there (auth/session, RLS/RPC, data integrity, CI/deps, docs that lie).
- Sensitive paths are High by default. A docs-only edit inside those trees can still be Low. Do not class them as Medium.
- Fix every `Important` finding before calling the PR done.
- At most 3 review↔fix rounds. If it is still wrong, stop and ask for a different approach.

## Risk → gate

| Risk | Gate |
|------|------|
| Low | Verify and adversarial review are green. May merge. Docs, copy, additive work behind a flag. |
| Medium | kir sees the evidence (commands and the review summary). Ordinary product UI/API outside the sensitive paths. |
| High | kir must explicitly approve. Production Supabase, auth/session (`app/api/auth/**`), `middleware.ts`, `utils/supabase/**`, secrets, CI workflows (`.github/workflows/**`), migrations (`supabase/migrations/**`), and `database/**`. |
