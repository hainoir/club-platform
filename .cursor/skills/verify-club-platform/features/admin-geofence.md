# Admin geofence settings

An admin changes the studio center, radius, and accuracy cap from the existing settings page. The save calls `update_studio_geofence`. Radius must be 20 to 200 meters. The accuracy cap must be 30 to 200 meters. A successful save appends `studio_geofence_audits` and the page lists the latest rows. Members do not see the tab.

## Sub-features

- `geofence-find-form` opens the `工作室围栏` tab and reads the current latitude, longitude, radius, and accuracy cap.
- `geofence-bounds` rejects a radius under 20 or over 200, and an accuracy cap under 30 or over 200, before the RPC runs. The page shows `围栏半径必须在 20 到 200 米之间。` or `精度上限必须在 30 到 200 米之间。`
- `geofence-audit` shows the new `studio_geofence_audits` reason after a successful save.

## How to get to it (user POV)

- Sign in as the admin.
- Open `设置中心` at `/settings`, from the sidebar or from the account menu item `设置`.
- Admins see a fifth tab, `工作室围栏`, beside `通知提醒`, `界面偏好`, `账号资料`, and `安全设置`.
- The form fields are 纬度, 经度, 半径（米）, 精度上限（米）, and 原因. Save with `保存围栏`.
- A member session has the original four tabs and no `#geofence-radius` field.

## Driving it with Playwright

Preconditions:

- Admin session for the save. A member session for the hidden-tab check.
- `doctor.sh` exits 0.
- Note the current `studio_geofence_audits` count with `query-db.sh` before you click anything.
- Restore the original latitude, longitude, radius, and accuracy cap before leaving the page. Later sign-in steps read the live fence.

- **Open settings.** `gotoProtectedPath(page, '/settings')`. Expect heading `设置中心`.
- **Open the fence tab.** Click the tab `工作室围栏`. Wait until `#geofence-radius` has a value.
- **Reject an out-of-range radius in the form.** Fill `#geofence-radius` with `10`, fill `#geofence-reason`, and click `保存围栏`. Expect the alert `围栏半径必须在 20 到 200 米之间。` The audit count stays the same.
- **Save a legal radius.** Fill a radius other than the current one, inside 20 to 200, with reason `半径改为 <radius>`. Expect status `围栏已更新` and that reason in `最近的修改`. `query-db.sh` shows the new `radius_meters` and one new audit row.
- **Restore.** Save the original four numbers with a reason. Confirm `radius_meters` matches the value read at the start.
- **Member.** Sign in as the member, open `/settings`, and expect zero tabs named `工作室围栏`.

Do not call `update_studio_geofence` from SQL. A direct RPC call is not the settings page.

## Gotchas

- `authenticated` can `select` `studio_geofence` and cannot `update` the table. The old admin update policy was dropped in `20261015092000_duty_sign_in_enforcement.sql`.
- The roles that see the tab are the same set `is_current_admin()` uses: `admin`, `管理员`, `主席`, `执行主席`, `副主席`, and `部长`. The seeded admin is `主席`. The seeded member is `干事`.
- Out of bounds errors from the RPC are `围栏半径必须在 20 到 200 米之间。` (`radius_out_of_bounds`) and `精度上限必须在 30 到 200 米之间。` (`accuracy_out_of_bounds`). The form shows those strings for its own check, and it shows `error.message` when the RPC rejects the save.
- The sign-in card reads `studio_geofence.radius_meters` and shows `工作室 <radius> 米`. While that read is in flight, or if it fails, the sentence omits the number: `系统设定的工作室范围内`. It does not keep a hardcoded 50.
- The toast disappears after 3 seconds. Assert the status text `围栏已更新`, not only the toast.
