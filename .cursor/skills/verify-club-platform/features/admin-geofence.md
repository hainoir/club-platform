# Admin geofence settings

An admin should be able to change the studio center, radius, and accuracy cap, and the change should append `studio_geofence_audits`. The database allows that only through `update_studio_geofence`. Radius must be 20 to 200 meters. The accuracy cap must be 30 to 200 meters. The settings screens do not offer this form.

## Sub-features

- `geofence-find-form` looks for a radius control in settings.
- `geofence-bounds` would reject a radius under 20 or over 200, and an accuracy cap under 30 or over 200, if a form existed.
- `geofence-audit` would show a new `studio_geofence_audits` row after a successful save, if a form existed.

## How to get to it (user POV)

- Sign in as the admin.
- Open `设置中心` at `/settings`, from the sidebar or from the account menu item `设置`.
- The tabs are `通知提醒`, `界面偏好`, `账号资料`, and `安全设置`.
- None of those tabs ask for a radius, a latitude, or a fence.

## Driving it with Playwright

Preconditions:

- Admin session.
- `doctor.sh` exits 0.
- Note the current `studio_geofence_audits` count with `query-db.sh` before you click anything.

- **Open settings.** `gotoProtectedPath(page, '/settings')`. Expect heading `设置中心`.
- **Search every tab.** Click each tab name above. Read the page text.
- **Stop when the form is missing.** If the text has no `半径` and no `围栏`, the journey fails. Screenshot `.verification-artifacts/evidence/duty-sign-in/settings.png` or a new file under `.verification-artifacts/evidence/admin-geofence/`. Leave the audit count unchanged.
- **Do not continue in the database.** `update_studio_geofence(39.181074, 117.12138, 80, 100, '半径改为 80')` is the RPC an admin client would call, and a direct call writes the audit row. That call is not the settings page. A journey that uses it has not verified this feature.

## Gotchas

- The user path is missing. `drive-duty-sign-in.mjs` records `admin-geofence` as `fail` for this reason. That failure is the result. Do not weaken it into a pass.
- Authenticated clients can `select` `studio_geofence` and cannot `update` the table. The old admin update policy was dropped in `20261015092000_duty_sign_in_enforcement.sql`.
- Out of bounds errors from the RPC are `围栏半径必须在 20 到 200 米之间。` (`radius_out_of_bounds`) and `精度上限必须在 30 到 200 米之间。` (`accuracy_out_of_bounds`). You only see them after a real form exists.
- The sign-in card still says `工作室 50 米`. That sentence is copy, not the live radius.
