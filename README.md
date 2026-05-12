# Club Platform

[English](./README.md) | [简体中文](./README.zh-CN.md)

A Next.js 15 + Supabase application for club operations, duty workflows, events, and member management.

## Portfolio Summary

Club Platform is a campus club operations system focused on authenticated workflows rather than a static management dashboard. The strongest engineering chain is:

- Server-side dashboard aggregation with App Router and Supabase SSR.
- Auth/session synchronization across middleware, providers, and Zustand state.
- Location-aware duty sign-in with duplicate-sign-in protection.
- Approval-based duty leave, substitute swap, compensation-date, and key-transfer workflows.
- Separate self-study presence tracking through `studio_sessions` and an RPC cleanup boundary.
- Playwright coverage for protected flows, duty operations, member search, self-study, notifications, settings, and event RSVP.

Useful deep-dive docs:

- [Architecture Notes](./docs/architecture.md)
- [Duty Workflow Contract](./docs/duty-contract.md)
- [Supabase RPC Checklist](./docs/supabase-rpc-checklist.md)

## Tech Stack
- Next.js App Router
- React 19 + TypeScript
- Supabase (Auth, Database, Storage)
- Tailwind CSS
- Playwright

## Quick Start
```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env.local
```

Open `http://localhost:3000`.

## Environment Setup
Required local variables:

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Optional E2E account variables are listed in `.env.example`.

## Deployment Workflow

This repository uses a Git-driven Vercel workflow:

- `main` is the production branch.
- Non-`main` branches and pull requests should deploy to Vercel Preview.
- Merge to `main` only after the Preview URL has been verified.

Configure the following Vercel environment variables for both `Preview` and `Production`:

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Optional `E2E_*` variables can be added later if preview deployments need protected-flow testing.

Recommended release flow:

1. Create a feature branch.
2. Push the branch and open the Vercel Preview URL.
3. Verify the preview behavior and CI status.
4. Merge into `main` to trigger the production deployment.

Do not commit `.vercel` or `.env*.local` files.

## Security Hardening Notes (Release Checklist)

### Local environment files
- `.env.local` is local-only and must never be committed.
- `.gitignore` already includes `.env*.local`.
- Verify `.env.local` is not tracked:

```bash
git ls-files .env.local
```

Expected result: no output.

### Key rotation after exposure
Treat previously committed keys as exposed and rotate before release.

Minimum required actions:
1. Rotate `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Supabase project settings.
2. Replace the key value in local `.env.local`.
3. Update GitHub Actions repository secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `E2E_MEMBER_EMAIL`
   - `E2E_MEMBER_PASSWORD`
   - `E2E_ADMIN_EMAIL`
   - `E2E_ADMIN_PASSWORD`
   - `E2E_KEY_RECEIVER_EMAIL`
   - `E2E_KEY_RECEIVER_PASSWORD`
4. Re-run CI and confirm lint, typecheck, unit tests, smoke E2E, and read-only E2E all execute.
5. Run `pnpm run e2e:mutation` only against an isolated Supabase environment when write-path verification is needed.

## Quality Gate
Local checks:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run e2e:smoke
pnpm run e2e:readonly
```

`pnpm run e2e:mutation` is reserved for isolated environments because it exercises approval, RSVP, sign-in, self-study, and profile write paths.
