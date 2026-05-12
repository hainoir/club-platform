# Contributing

## Branching and Deployments

- Use feature branches for all changes.
- Vercel Preview deployments should be used for branch and pull request validation.
- `main` is reserved for production releases on Vercel.

## Release Flow

1. Create a branch from `main`.
2. Implement the change and open a pull request.
3. Verify the Vercel Preview deployment and the GitHub Actions quality gate.
4. Merge into `main` only after preview verification passes.

## Required Vercel Environment Variables

Set these variables in both the `Preview` and `Production` environments:

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Add the optional `E2E_*` variables only if preview or CI flows need authenticated end-to-end validation.

## Local Safety Rules

- Never commit `.env*.local`.
- Never commit `.vercel`.
- Run the local quality gate before merging when possible:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run e2e:smoke
pnpm run e2e:readonly
```

Run `pnpm run e2e:mutation` only against an isolated Supabase environment because those specs exercise real write paths.
