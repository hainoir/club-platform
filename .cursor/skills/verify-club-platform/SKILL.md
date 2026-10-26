---
name: verify-club-platform
description: "Drive the club-platform Next.js App Router UI against a local Supabase stack and prove login, duty sign-in, the dashboard, roster, and geofence settings with Playwright. Use when verifying this repo, reproducing a duty sign-in result, or checking a local stack before a PR."
---

# Verify club-platform

The surface is the web app. Seeded accounts, migrations, and Playwright selectors already live in this repo. Drive those. Do not invent a second harness, and do not call `submit_duty_sign_in` or `update_studio_geofence` from SQL to make a journey pass.

Two stacks cannot share this machine. `supabase/config.toml` pins `project_id = "club-platform"` and ports 54320, 54321, 54322, 54323, 54324, and 54327. The app for this skill listens on 3001. If any of those ports are open, or `club-platform` Supabase containers already exist, stop. Do not drive a stack this run did not start.

## Launch

From the repo root:

```bash
.cursor/skills/verify-club-platform/scripts/launch.sh
```

The script refuses when a verification state file, a target port, or an existing `club-platform` container is present. `VERIFY_ALLOW_RESET=1` is the only override, and it wipes that local database.

Launch then runs the same Supabase command as `.github/workflows/ci.yml`, `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,mailpit`, then `pnpm run db:reset`, and writes `.env.local` from `supabase status -o env`. `db reset` replays `supabase/migrations` and `supabase/seed.sql`. The exclusions drop Realtime, Studio, and the analytics containers. This app has no Realtime subscription. A full `pnpm run db:start` can still exit 1 while Realtime runs its own migrations and cannot borrow a database connection. Treat that as a stack startup failure, not as a sign-in failure, and use the command above. Seed creates `e2e.member@club.local`, `e2e.admin@club.local`, `e2e.receiver@club.local`, and `e2e.study@club.local`. It inserts `duty_rosters` for the member on 第二节 (period 2, 10:05–11:40 Asia/Shanghai) Monday through Friday, and leaves Monday 第一大节 empty. `e2e.study@club.local` has no roster. It does not insert `duty_logs` or a `duty_sign_in_clock` row. The fence row comes from `20261015083723_duty_signin_geofence.sql` (latitude 39.181074, longitude 117.12138, radius 50, max accuracy 100) unless a later migration changed it. Read the live row. Do not trust this sentence over the database.

`next build` runs only after `.env.local` exists. Next inlines `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time. Then the script starts `next start --hostname 127.0.0.1 --port 3001`.

Ready means `http://127.0.0.1:3001/login` contains `技术中心签到系统`, `public.studio_geofence` has one row, and `auth.users` has `e2e.member@club.local`. A database health check alone is not ready.

On failure the script runs cleanup for processes it started.

## Doctor

```bash
.cursor/skills/verify-club-platform/scripts/doctor.sh
```

Doctor is read-only. It checks the recorded Next pid, the login page, one fence row, the seeded member, and that the anon key is non-empty. It does not print the key. Exit 0 means the instance is worth driving. Anything else, run cleanup if this run started the stack, then launch again.

## Drive

Prefer `tests/e2e/helpers/auth.ts`. `loginWithPassword(page, email, password)` opens `/login`, fills `#email` and `#password`, and clicks `form button[type="submit"]`. `gotoProtectedPath` is the retry used by the existing specs. The shell is ready when `data-testid="notification-trigger"` is visible and the URL is not `/login`.

Accounts, from `.env.local` after launch:

- Member `e2e.member@club.local` / `e2e-member-pass`, role `干事`, lands on `/`.
- Admin `e2e.admin@club.local` / `e2e-admin-pass`, role `主席`, lands on `/duty`.

Geolocation for a real sign-in attempt uses only the Playwright context:

```js
await context.grantPermissions(['geolocation'])
await context.setGeolocation({ latitude, longitude, accuracy: 10 })
```

Read `latitude`, `longitude`, and `radius_meters` from `public.studio_geofence` first. The inside point is that center with `accuracy` below `max_accuracy_meters`. The outside point is the center plus more than `radius_meters` (the drive script moves north by `radius_meters + 500`). Do not stub `navigator.geolocation` with `addInitScript`. `tests/e2e/duty-signin-error.spec.ts` uses `grantPermissions` and `setGeolocation` for inside, outside, and inaccurate fixes. The empty-payload case still replaces `getCurrentPosition`, because `setGeolocation` cannot return null. That stub is not the user path for this skill.

`lib/shared/geolocation.ts` gives the first fix 10 seconds and a 12 second hard stop, then a second fix with a 12 second timeout and a 15 second hard stop. After the click, wait 30 seconds for the toast. The toast in `components/ui/toast-simple.tsx` removes itself after 3 seconds, so read the text as soon as it appears.

Three clocks have to name the same Shanghai slot. The button reads the browser clock. The homepage's assigned periods read `new Date()` in the Next server. `submit_duty_sign_in` reads `duty_sign_in_instant()` in Postgres.

The verification slot is `scripts/duty-clock.txt`, currently `2026-10-15T08:30:00+08:00`. That Thursday is a non-holiday weekday, and 08:30 sits in class period 1 and in database period 1. Launch starts Next with `NODE_OPTIONS=--require scripts/freeze-duty-clock.cjs` and `VERIFY_DUTY_CLOCK_FILE` pointing at that file. The preload shifts `Date` in that process so it begins at the slot and then advances. It is not part of the app bundle, and `next build` does not load it. Playwright's own server does not load it either.

Set the browser clock before `goto`:

```js
await page.clock.setFixedTime(new Date('2026-10-15T08:30:00+08:00'))
```

`page.clock.setFixedTime` freezes the page. Use the same date for the roster column. Class windows that enable the button are 08:00 to 09:35, 10:05 to 11:40, 13:30 to 15:05, and 15:35 to 17:10. The database window is wider and starts at 07:30, 09:35, 13:00, and 15:05.

Postgres does not follow either of those clocks. The production function in `supabase/migrations/20261015092000_duty_sign_in_enforcement.sql` returns `now()` unless `session_user` is `postgres` or `supabase_admin` and the GUC `duty.sign_in_at` is set. PostgREST's session user is `authenticator`, so that GUC does nothing for a signed-in browser. Leave that function as it is. Do not add a migration that lets `authenticator` or `authenticated` choose the time.

`supabase/seed.sql` runs only on `supabase db reset`, which is the local stack and CI. After the migrations it creates `public.duty_sign_in_clock` and replaces `duty_sign_in_instant()` for that database. An empty table still returns `now()`, and the superuser GUC still works when the table is empty. A row in the table supplies the instant for every connection, including PostgREST. The same seed block replaces `sync_duty_sign_in_date()` so the inserted `sign_in_time` is that instant. `duty_logs.sign_in_time` defaults to `now()`, and the migration trigger keeps a non-null default, so the window check and the stored timestamp would otherwise disagree. With no clock row the seed trigger keeps `coalesce(new.sign_in_time, now())`, which is the migration behavior. `authenticated` and `anon` have no privileges on the table, and row level security has no policy. The drive script inserts the slot as the database superuser, and its `finally` block deletes the row before Playwright starts. Hosted projects do not run `seed.sql`. Copying that block into `supabase/migrations` would ship a bypass. Do not do that.

`pnpm exec playwright test` starts its own server because `reuseExistingServer` is false in `playwright.config.ts`. Stop the verification server before that command, or the port clash fails the run. The duty journey for this skill is the script in Helpers, which attaches to the server launch already started.

## Evidence

Write proof under `.verification-artifacts/evidence/`. That directory is gitignored. Cleanup must leave it in place.

For duty sign-in, capture the screen before and after the click, plus the `duty_logs` rows for `e2e.member@club.local`. A toast is not enough. Query with `query-db.sh`. An inside-fence pass is one row whose `sign_in_date` is the date in `scripts/duty-clock.txt`, whose Shanghai `sign_in_time` is 08:30, whose `location_verified` is true, and whose coordinates are the fence center. A rejection pass is the visible error and zero new rows.

The button still calls `submit_duty_sign_in`. The only database write the script adds is the single `duty_sign_in_clock` row, and it deletes that row when it finishes. Do not insert `duty_logs` yourself.

## Cleanup

```bash
.cursor/skills/verify-club-platform/scripts/cleanup.sh
```

Cleanup kills the recorded Next pid only when `/proc/<pid>/cmdline` contains `next` and `--port 3001`. If launch started Supabase, cleanup runs `supabase stop --no-backup` for this project only. It restores a previous `.env.local` when it replaced one, deletes `.verification-artifacts/run/`, and does not delete `.verification-artifacts/evidence/`. Run it after every failed launch or drive, including a crash halfway through.

## Helpers

Run these from the repo root. Each file is executable.

```bash
.cursor/skills/verify-club-platform/scripts/launch.sh
.cursor/skills/verify-club-platform/scripts/doctor.sh
.cursor/skills/verify-club-platform/scripts/drive-duty-sign-in.mjs
.cursor/skills/verify-club-platform/scripts/query-db.sh "select count(*) from public.duty_logs"
.cursor/skills/verify-club-platform/scripts/cleanup.sh
node .cursor/skills/verify-club-platform/scripts/check-skill.mjs
```

`drive-duty-sign-in.mjs` logs in as the admin, opens settings and duty through the sidebar links, assigns `E2E 成员` for the weekday of `scripts/duty-clock.txt` through `指派成员`, then drives the member button with `page.clock` and context geolocation. It writes the local duty clock before the member steps and deletes that row in `finally`. It waits until `lock:sb-127-auth-token` is idle before each write. Exit 0 means every recorded step passed, including a real `duty_logs` row. Exit 2 means the script finished and `evidence/duty-sign-in/result.json` records a failure, including the missing geofence form. Exit 1 means the script lost the UI. Do not flip an exit 2 into a pass by inserting `duty_logs` yourself.

The slot file and the Next preload are stand-ins for the wall clock:

- `scripts/duty-clock.txt` is the Shanghai instant the browser and the database share.
- `scripts/freeze-duty-clock.cjs` shifts `Date` in the verification Next process so the homepage treats that instant's weekday as today. Time still advances, so timeouts keep working. The file is loaded only through `NODE_OPTIONS` in `launch.sh`.

`query-db.sh` prints query rows only. It reads the URL from the run state and does not echo it.

Feature recipes live in `features/`. Read `features/README.md` before driving a feature that the script does not cover.

## Maintenance

When the app changes, run `/maintain-verification-skill` against `.cursor/skills/verify-club-platform/`.
