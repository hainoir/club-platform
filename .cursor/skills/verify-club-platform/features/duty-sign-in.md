# Duty sign-in

A rostered member, inside the studio fence and inside a class period, presses `立即验证定位并签到`. The app writes one `duty_logs` row for the Shanghai calendar day. Outside the fence, without coordinates, outside the shift, off the roster, or on a public holiday, the same button does not write a row.

## Sub-features

- `sign-in-inside` writes one verified row from a point inside the live fence.
- `sign-in-outside` shows the distance error and writes nothing.
- `sign-in-no-coords` shows the permission error and writes nothing.
- `sign-in-once` keeps a single row for that member and Shanghai date, and replaces the button with `今日已签到`.
- `sign-in-shanghai-date` stores `sign_in_date` as `timezone('Asia/Shanghai', sign_in_time)::date`.
- `sign-in-outside-window` shows `当前不在班次时间内` or, when the RPC runs, `当前不在值班签到时段。`
- `sign-in-not-rostered` shows `您未被安排在当前班次` when the browser period is not in the server's assigned list.
- `sign-in-holiday` shows `公共假日无需值班` when the browser date is a China public holiday.

## How to get to it (user POV)

- Sign in as the member and stay on `我的工作台`.
- The card title is `值班考勤打卡`.
- The button is enabled only inside your rostered class period, on a weekday that is not a public holiday.
- Press `立即验证定位并签到`. The label becomes `正在验证定位...`, then a toast reports success or failure.

## Driving it with Playwright

Preconditions:

- `doctor.sh` exits 0.
- An admin has assigned `E2E 成员` for today's Shanghai weekday, period 1, through the roster recipe. If `指派成员` is missing, stop and use the roster Gotchas. Do not insert the roster in SQL.
- `query-db.sh` has printed one `studio_geofence` row. Call those numbers `lat`, `lng`, and `radius`.
- Browser time for the click is 08:30 Asia/Shanghai on that same date. Call `page.clock.setFixedTime` before `goto('/login')`, then sign in on that same page. Do not `page.goto('/')` afterwards. A fresh document deadlocks `lock:sb-127-auth-token`, and the sign-in click then never reaches the RPC.
- Postgres `select to_char(timezone('Asia/Shanghai', now()), 'HH24:MI')` is inside a database period if you expect a row. If it is not, the inside-fence step fails closed.

- **Enabled button.** With the clock at 08:30, expect `getByRole('button', { name: '立即验证定位并签到' })` to be enabled.
- **Outside the class window.** Set the clock to 12:10 on the same date before a new login. The button name is `当前不在班次时间内` and it is disabled. Do not click it.
- **Not rostered in the browser.** Set the clock to 10:10 (period 2) after assigning only period 1. The button name is `您未被安排在当前班次`. The help text is `当前班次中没有您的排班记录`. The RPC `not_rostered` hint is not reached, because the disabled button never calls `submit_duty_sign_in`.
- **Holiday.** Set the clock to `2026-10-01T08:30:00+08:00` before a new login. The button name is `公共假日无需值班`. The database holiday hint is not reached for the same reason. `lib/duty/china-public-holidays.ts` lists that date.
- **Outside the fence.** Grant geolocation and set `{ latitude: lat + (radius + 500) / 111320, longitude: lng, accuracy: 10 }` with the clock back at 08:30. Click the enabled button. Within 30 seconds the body contains `当前位置距离工作室约` and `超出允许范围`. `duty_logs` for this member is still empty.
- **No coordinates.** Use a context that does not call `grantPermissions` or `setGeolocation`. Click the enabled button. The body contains `定位权限被拒绝`. `duty_logs` is still empty. Do not install a fake `navigator.geolocation`.
- **Inside the fence.** Grant geolocation and set `{ latitude: lat, longitude: lng, accuracy: 10 }`. Click. On success the toast says `签到成功` and `已完成位置验证并记录到值班考勤`. Query `duty_logs` joined to `members.email = 'e2e.member@club.local'`. Expect one row, `location_verified` true, and `sign_in_date` equal to `timezone('Asia/Shanghai', now())::date`.
- **One a day.** Sign in again at the same clock time in a new context. The card shows `今日已签到` and the sign-in button is gone. The query still returns one row for that `sign_in_date`.
- **Server window.** If the toast is `签到失败` and `当前不在值班签到时段。`, and the query returns no row, record `inside-fence` as fail. The browser was inside the class window and Postgres `now()` was not. Do not set `duty.sign_in_at` and do not insert a row.
- **Executable form.** `node .cursor/skills/verify-club-platform/scripts/drive-duty-sign-in.mjs` runs this sequence and writes `.verification-artifacts/evidence/duty-sign-in/`.

## Gotchas

- The first geolocation attempt hard-stops at 12 seconds. A fallback can add about 15 seconds. Wait 30 seconds before calling the click a timeout.
- `page.clock` changes the button only. The insert uses Postgres `now()` in `Asia/Shanghai`. The homepage's assigned periods are computed by the Next server clock, also `Asia/Shanghai`, and are not moved by `page.clock`.
- Seed has no roster. The journey gets one only through `指派成员`. If that button is missing, fail the journey in the roster Gotchas.
- The client rejects an empty or out-of-range fix before the RPC. `invalid_coordinates` from the trigger is not reachable by denying permission or by `setGeolocation`.
- The button cooldown is 5 seconds inside one mounted card. A new page starts a new cooldown.
- `tests/e2e/duty-signin-error.spec.ts` skips the click when the account is outside the active period. This recipe does not skip. It records the disabled label or the RPC error.
- Public holidays in the button use `lib/duty/china-public-holidays.ts`. The SQL function `is_china_public_holiday` must match that list. 2026-10-15 is not in the list. 2026-10-01 through 2026-10-07 are.
