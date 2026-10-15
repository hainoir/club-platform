# Club platform verification map

Read this index, then use one feature file as the recipe. Launch and doctor from `../SKILL.md` before any recipe. Drive only the stack `launch.sh` started.

## Baseline preconditions

- App at `http://127.0.0.1:3001` after `scripts/launch.sh`.
- `scripts/doctor.sh` exits 0.
- Seeded member, admin, and key receiver from `supabase/seed.sql`.
- No `duty_rosters` rows until an admin assigns one in the duty table.
- One `studio_geofence` row. Read it. Do not hard-code the radius for a proof.

## Driving conventions

- Log in with `#email`, `#password`, and `form button[type="submit"]`, or call `loginWithPassword` from `tests/e2e/helpers/auth.ts`.
- Prefer role names and the test id `notification-trigger`.
- Geolocation is `context.grantPermissions(['geolocation'])` and `context.setGeolocation`. No `addInitScript` stub.
- Browser time is `page.clock.setFixedTime` before navigation. Postgres `now()` stays the machine clock.
- Proof screenshots and SQL dumps go to `.verification-artifacts/evidence/<feature>/`.
- Cleanup does not delete that directory.

## Proof and skip reporting

- Save the action and the resulting `duty_logs` or `duty_rosters` rows, not only the final screen.
- If a path is impossible, write the command you ran and the missing precondition in that feature's Gotchas.
- Do not mark a skipped entry as verified through SQL or a direct RPC call.

## Features

- [Login and auth](./login-auth.md) covers password login, the post-login redirect, and logout.
- [Duty sign-in](./duty-sign-in.md) covers the fence, missing coordinates, one sign-in a day, the Shanghai date, and the shift, roster, and holiday rejections.
- [Dashboard](./dashboard.md) covers the member home screen and its sign-in entry.
- [Roster and leave](./roster-leave.md) covers admin assignment and the member leave entry.
- [Admin geofence settings](./admin-geofence.md) covers the radius bounds and the audit row. The settings UI does not expose them.
