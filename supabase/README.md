# 本地数据库

Schema、RLS、函数和 RPC 的事实来源是 `supabase/migrations/`。`supabase db reset` 会按文件名时间戳顺序在空库上重放它们，然后执行 `supabase/seed.sql`。

## 迁移文件

| 文件 | 内容 |
| --- | --- |
| `*_core_tables.sql` | `members`、`events`、`event_attendees`、值班/请假/钥匙/自习表，以及 `events` 存储桶 |
| `*_functions_and_triggers.sql` | 注册触发器、签到日期、请假到期，以及全部客户端 RPC |
| `*_rls_policies.sql` | 最终 RLS。后来脚本替换掉的策略只保留最终版本；只追加、未删除的 v2 策略与原策略同时保留 |
| `*_privileges.sql` | 撤销 `PUBLIC` / `anon` 对安全定义函数的执行权限，只把客户端 RPC 授给 `authenticated` |

代班 RPC（`accept_duty_swap`、`volunteer_for_duty_swap`、`return_duty_swap_to_hall`）只定义一次，内容与原先 `database/update_swap_status.sql` 的最终版本一致，并包含关联请假的批准。

## 本地启动

需要 Docker 和 [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)（本仓库在 CI 中固定为 2.121.0）。

```bash
pnpm install
pnpm run db:start
pnpm run db:reset
supabase status
```

把 `supabase status` 打印的 API URL 和 anon key 写入 `.env.local`：

```properties
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
```

`pnpm run db:start` 会拉起完整本地栈。CI 会跳过 Studio、Realtime、分析组件等本应用用不到的容器，迁移本身不依赖它们。

## 种子账号

`supabase/seed.sql` 会创建三个可登录账号，供本地开发和 CI 使用。密码只存在于本地库，不要拿到生产环境。

| 角色 | 邮箱 | 密码 | `members.role` |
| --- | --- | --- | --- |
| 成员 | `e2e.member@club.local` | `e2e-member-pass` | 干事 |
| 管理员 | `e2e.admin@club.local` | `e2e-admin-pass` | 主席 |
| 钥匙接收人 | `e2e.receiver@club.local` | `e2e-receiver-pass` | 干事 |

另外会插入一条尚未开始的活动，让报名用例有数据可点。

## 生成类型

本地栈启动后：

```bash
pnpm run gen:types
```

这会执行 `supabase gen types --lang typescript --local --schema public`，再把 `members` 的 Insert 类型里的 `email` 改回可选。管理端添加成员的表单不收集邮箱，和原先手写类型一致；数据库列仍然是 `NOT NULL`，注册触发器会写入邮箱。

## 已有托管项目

这四条迁移是空库基线，不是给已经用 SQL Editor 建过表的生产库重放的增量脚本。新库里若干由默认值或触发器保证的时间戳、`duty_leaves.status`、`key_transfers.status`、`duty_compensations.completed`、`studio_sessions.started_at` 和 `is_active` 被收成 `NOT NULL`，`duty_leaves.expires_at` 另有 `default now()`，插入时由触发器覆盖。已经建好的托管库用下面的 `migration repair` 标记版本即可，不要为了这一处空值差异去改生产列。

1. 确认托管库已经具备这里描述的最终表、策略和 RPC。还缺英文枚举回填或请假到期字段的，先从 Git 历史里的 `database/normalize_profile_fields_to_zh.sql` 和 `database/leave_expiry_migration.sql` 处理；不要在新基线上重跑请假到期回填，它会把缺少日期的旧请假标成已过期。
2. 把本仓库的迁移版本标记为已应用，而不是再执行一遍：

```bash
supabase migration repair --status applied 20261015080916
supabase migration repair --status applied 20261015080917
supabase migration repair --status applied 20261015080918
supabase migration repair --status applied 20261015080919
```

3. 之后的 schema 变更用 `supabase migration new <name>` 追加新文件，再用 `supabase db push` 推到远端。

## 吸收后续的 `database/duty_signin_geofence.sql`

如果 `database/duty_signin_geofence.sql` 在这组基线之后合入（例如 PR #16），不要把它并进上面四条基线，也不要改 `*_privileges.sql`。把它变成下一条迁移：

```bash
supabase migration new duty_signin_geofence
```

把 `database/duty_signin_geofence.sql` 的全文原样贴进新生成的 `supabase/migrations/<timestamp>_duty_signin_geofence.sql`。该文件已经是幂等的，依赖本基线里的 `duty_logs` 和策略名 `允许自己提交打卡`。它会：

- 创建 `studio_geofence`，并插入一条默认坐标（冲突时跳过）
- 在 `duty_logs` 上添加 `BEFORE INSERT` 触发器函数 `enforce_duty_sign_in_geofence`（不授予客户端执行）
- 创建 `submit_duty_sign_in(double precision, double precision, double precision, text)`，只授予 `authenticated`
- 删除插入策略 `允许自己提交打卡`，并撤销 `PUBLIC` / `anon` / `authenticated` 对 `duty_logs` 的直接 `INSERT`

`*_privileges.sql` 先于该文件执行，不会覆盖它自己的 `GRANT` / `REVOKE`。合入后可以从 Git 历史删除那份松散 SQL。

## 校验

`supabase db reset` 成功之后，至少应满足：

- `duty_swaps.status` 只接受 `pending`、`accepted`、`approved`、`rejected`。
- `accept_duty_swap`、`volunteer_for_duty_swap`、`return_duty_swap_to_hall`、`approve_duty_leave`、`confirm_key_transfer`、`expire_studio_sessions` 存在，`authenticated` 可执行，`anon` 与 `PUBLIC` 不可执行。
- `handle_new_user`、`sync_duty_sign_in_date` 和请假到期触发器函数不能被 `anon` 或 `authenticated` 直接执行。
- `event_attendees_event_email_unique` 与 `duty_logs_member_sign_in_date_unique` 存在。
- `duty_leaves.leave_date`、`duty_leaves.expires_at`、`duty_swaps.leave_id`、`duty_compensations.compensation_date` 存在且非空。
- 公开的 `events` 桶没有 `Public Access` 或 `events_bucket_read` 这类宽泛 SELECT 策略。
