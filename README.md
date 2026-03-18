# Club Platform

[English](./README.md) | [简体中文](./README.zh-CN.md)

A Next.js 15 + Supabase application for club operations, duty workflows, events, and member management.

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
4. Re-run CI and confirm smoke + full E2E both execute.

## Quality Gate
Local checks:

```bash
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run e2e:smoke
pnpm run e2e -- --reporter=line
```

CI runs the same flow, with smoke tests first and full E2E after.
