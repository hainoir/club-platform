# Login and auth

A visitor signs in with email and password. A member lands on the dashboard. An admin lands on duty management. The account menu signs them out.

## Sub-features

- `login-member` signs in `e2e.member@club.local` and opens `/`.
- `login-admin` signs in `e2e.admin@club.local` and opens `/duty`.
- `login-bad-password` shows `登录失败` and stays on `/login`.
- `logout` returns to the login page.

## How to get to it (user POV)

- Open `http://127.0.0.1:3001/login`. The heading is `技术中心签到系统`.
- Type the email in `邮箱` and the password in `密码`, then press `登录`.
- Open a protected URL such as `/` while signed out. The middleware sends you to `/login`.
- After sign-in, open the header account button and choose `退出登录`.

## Driving it with Playwright

Preconditions:

- `doctor.sh` exits 0.
- Passwords are the seed values in `.env.local`.

- **Member login.** Run `loginWithPassword(page, process.env.E2E_MEMBER_EMAIL, process.env.E2E_MEMBER_PASSWORD)` from `tests/e2e/helpers/auth.ts`. The URL is `/`, the heading is `我的工作台`, and `notification-trigger` is visible.
- **Admin login.** Run the same helper with `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`. The URL pathname is `/duty` and the heading is `值班管理`.
- **Bad password.** Fill `#email` with `e2e.member@club.local` and `#password` with `wrong-pass`, then click `form button[type="submit"]`. A toast title `登录失败` appears and the URL still starts with `/login`.
- **Logout.** Click the header button that contains the user icon, then `getByRole('menuitem', { name: '退出登录' })` or the menu text `退出登录`. The next protected navigation returns to `/login`.

## Gotchas

- The account button has no accessible name. The theme button is named `切换主题`, and notifications use `notification-trigger`. The remaining header icon button opens the menu.
- `登录失败` disappears after 3 seconds.
- A production build that ran before `.env.local` had the anon key shows a login error for the right password. Rebuild after launch writes the env file.
- Do not reuse a storage state from another port or another Supabase stack. A stored session plus `page.goto` on a protected URL deadlocks `lock:sb-127-auth-token`. Sign in through the form and follow sidebar links.
