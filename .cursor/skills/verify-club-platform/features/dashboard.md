# Dashboard

The signed-in member home is `我的工作台`. It shows the sign-in card, leave and swap entry points, and key handoff. It does not show the admin duty totals.

## Sub-features

- `dashboard-open` shows `我的工作台` and `值班考勤打卡`.
- `dashboard-actions` shows `代班大厅`, `我要请假`, and the heading `钥匙交接`.
- `dashboard-no-admin-totals` does not show `今日排班总数` or `今日值班名单` on `/`.

## How to get to it (user POV)

- Sign in as the member. The app opens `/`.
- Or choose `我的工作台` in the sidebar.

## Driving it with Playwright

Preconditions:

- Member session from `login-auth.md`.
- `gotoProtectedPath(page, '/')`.

- **Open.** Expect `getByRole('heading', { name: '我的工作台' })` within 15 seconds.
- **Sign-in card.** Expect text `值班考勤打卡`.
- **Actions.** Expect `getByRole('button', { name: /代班大厅/ })`, `getByRole('button', { name: /我要请假/ })`, and `getByRole('heading', { level: 3, name: '钥匙交接' })`.
- **Admin copy stays on /duty.** Expect `getByText('今日排班总数')` and `getByRole('heading', { name: '今日值班名单' })` to have count 0. Those headings are on `/duty`.
- **Proof.** Screenshot `.verification-artifacts/evidence/dashboard/home.png` with the heading visible.

## Gotchas

- The sign-in button label changes with the clock and the roster. Asserting one label here is the duty sign-in recipe, not the dashboard recipe.
- `今日已签到` replaces the button after a successful sign-in. The dashboard recipe still passes if that banner is visible.
- Server data for "today" uses the Node process clock in `Asia/Shanghai`, not `page.clock`.
