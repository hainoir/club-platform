# Roster and leave

An admin assigns a member to a weekday period from the duty table. A member opens leave from the dashboard. Seed data has no roster and no leave, so assignment has to happen in the UI before a leave or a sign-in can see a slot.

## Sub-features

- `roster-assign` adds `E2E 成员` to a Monday through Friday period 1 slot through `指派成员` and inserts `duty_rosters`.
- `roster-member-view` shows the member the table without `指派成员`.
- `leave-open` opens `请假申请` from `我要请假`.
- `leave-empty` shows `当前没有可发起请假的排班` until a slot exists for that member.

## How to get to it (user POV)

- Admin signs in and lands on `/duty`. The heading is `值班管理`.
- In the grid, each period row is `第一大节` through `第四大节`, and each day column is `周一` through `周五`.
- Press `指派成员` in a cell, search the name, and choose the member. A toast says `指派成功`.
- Member signs in, stays on `/`, and presses `我要请假`. The dialog title is `请假申请`.

## Driving it with Playwright

Preconditions:

- `doctor.sh` exits 0.
- `select count(*) from public.duty_rosters` is 0 at the start.
- Admin session for assignment. Member session for leave.

- **Assign.** Stay in the document that submitted the login form. Open `/duty` with `getByRole('link', { name: '值班管理' })`, not `page.goto`. Wait until `navigator.locks.query()` shows no held or pending lock whose name contains `auth-token`. Take the row `getByRole('row', { name: /第一大节/ })` and the cell `getByRole('cell').nth(dow)` where `dow` is 1 for Monday through 5 for Friday. Click `getByRole('button', { name: '指派成员' })`, fill the placeholder `搜索姓名或学号...` with `E2E 成员`, and click `getByRole('button', { name: 'E2E 成员', exact: true })`.
- **Confirm the row.** The cell shows `E2E 成员`. Then run `query-db.sh` for that member, `day_of_week`, and `period`. The count is 1. A toast without this row is not a pass.
- **Member view.** Sign in as the member and open `/duty`. The heading `值班管理` is visible and `指派成员` has count 0. The helper text includes `普通成员可查看排班`.
- **Leave before a roster.** As the member, click `我要请假`. Expect `当前没有可发起请假的排班` when that member has no slot.
- **Leave after a roster.** Assign a slot first, reopen `我要请假`, and expect `选择请假班次` to list a period. Do not approve the leave in this recipe unless you also intend to block sign-in. An approved leave for the current slot makes the RPC return `not_rostered`.

## Gotchas

- If `指派成员` is absent, stop. The journey failed because the admin UI did not offer assignment. Do not insert `duty_rosters` from SQL and continue.
- `AuthProvider` registers an async `onAuthStateChange` that calls `getSession` while the auth client holds `lock:sb-127-auth-token`. A later `page.goto` to `/duty` or `/settings` loads a new document, the lock stays held, and `指派成员` closes the popover without an insert. Wait for that lock to go idle, then move with the sidebar links. If it is still busy after 15 seconds, fail the journey with that reason.
- The optimistic cell can show a name before the insert commits. The SQL count is the proof. A failed insert toasts `操作失败`.
- `day_of_week` in the table and in `evaluate_duty_sign_in_window` is ISO Monday = 1 through Friday = 5.
- There is no separate roster page. `/duty` is the only user path.
