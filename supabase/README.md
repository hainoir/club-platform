# 本地数据库

Schema、RLS、函数和 RPC 的事实来源是 `supabase/migrations/`。`supabase db reset` 会按文件名时间戳顺序在空库上重放它们，然后执行 `supabase/seed.sql`。

## 迁移文件

| 文件 | 内容 |
| --- | --- |
| `*_core_tables.sql` | `members`、`events`、`event_attendees`、值班/请假/钥匙/自习表，以及 `events` 存储桶 |
| `*_functions_and_triggers.sql` | 注册触发器、签到日期、请假到期，以及除签到以外的客户端 RPC |
| `*_rls_policies.sql` | 最终 RLS。后来脚本替换掉的策略只保留最终版本；只追加、未删除的 v2 策略与原策略同时保留。签到插入策略会在下一条迁移里删除 |
| `*_privileges.sql` | 撤销 `PUBLIC` / `anon` 对安全定义函数的执行权限，只把当时已有的客户端 RPC 授给 `authenticated` |
| `20261015083723_duty_signin_geofence.sql` | 原 `database/duty_signin_geofence.sql` 全文。`studio_geofence`、插入触发器、`submit_duty_sign_in`，并撤销 `duty_logs` 的直接 INSERT |
| `20261015092000_duty_sign_in_enforcement.sql` | 签到节次窗口、列锁、作废与补签审计，以及围栏只读。这一条是基线之后的增量，托管库需要实际执行 |
| `20261015120000_duty_sign_in_delete_audit.sql` | 收回 `duty_logs` 的 DELETE。管理员用 `delete_duty_sign_in` 删除并写原因；直接删除仍由触发器写入 `duty_sign_in_admin_events` 快照 |
| `20261016020000_duty_sign_in_stores_evaluation_instant.sql` | `submit_duty_sign_in` 把 `duty_sign_in_instant()` 写入 `sign_in_time`。登录会话仍是 `now()`。测试钉住的时刻和落库的上海日期因此是同一个时刻 |

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

另外会插入一条尚未开始的活动，让报名用例有数据可点。签到围栏坐标在迁移里的 `studio_geofence` 行，种子不再写一份。签到错误用例只在成员处于当前节次时才会点击按钮；没有排班时它们会跳过，避免在节次窗口里卡在浏览器定位超时上。

种子文件末尾还有一段本地签到时钟。`public.duty_sign_in_clock` 没有行时，`duty_sign_in_instant()` 仍然返回 `now()`，签到行的时间戳也仍由原来的触发器逻辑决定。验证脚本用数据库超级用户写入一个上海班次时刻后，本地 RPC 按那一时刻判断窗口，并且本地的 `sync_duty_sign_in_date()` 把同一时刻写入 `sign_in_time`。`duty_logs.sign_in_time` 的列默认值是 `now()`，迁移里的触发器会保留这个默认值，所以只改判断函数的话，落库时间仍是机器时间。跑完脚本会删掉时钟行。`authenticated` 和 `anon` 没有这张表的权限。这段 SQL 只存在于 `supabase/seed.sql`，不在 `supabase/migrations` 里，托管库不会执行。不要把它抄进迁移。

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
supabase migration repair --status applied 20261015083723
```

生产项目 `qpdbjizsccvebfqozmal` 的 `supabase_migrations.schema_migrations` 里已经有一行：`version = 20261015083723`，`name = duty_signin_geofence`。那是通过 Supabase API 应用的，不是这四条基线。仓库里的围栏文件使用同一个版本号，所以第五条命令把 CLI 历史对齐到这条已有记录，而不会再执行一遍 SQL。前四条版本目前不在该表里，需要标记为已应用。不要另建一个新的 `duty_signin_geofence` 时间戳，否则 `db push` 会再跑一次围栏脚本。

3. 之后的 schema 变更用 `supabase migration new <name>` 追加新文件，再用 `supabase db push` 推到远端。`20261015092000_duty_sign_in_enforcement.sql` 已在生产执行。下一条增量是 `20261015120000_duty_sign_in_delete_audit.sql`：把该文件全文贴进 SQL Editor 执行一次，成功后再 `supabase migration repair --status applied 20261015120000`。在 SQL 真正跑过之前不要只做 repair。其后是 `20261016020000_duty_sign_in_stores_evaluation_instant.sql`，同样先执行全文再 `supabase migration repair --status applied 20261016020000`。不要对生产库 `db push` 前面的基线，也不要重放已经执行过的 `20261015092000`。

## 校验

`supabase db reset` 成功之后，至少应满足：

- `duty_swaps.status` 只接受 `pending`、`accepted`、`approved`、`rejected`。
- `accept_duty_swap`、`volunteer_for_duty_swap`、`return_duty_swap_to_hall`、`approve_duty_leave`、`confirm_key_transfer`、`expire_studio_sessions` 存在，`authenticated` 可执行，`anon` 与 `PUBLIC` 不可执行。
- `handle_new_user`、`sync_duty_sign_in_date`、`enforce_duty_sign_in_geofence` 和请假到期触发器函数不能被 `anon` 或 `authenticated` 直接执行。
- `submit_duty_sign_in(double precision, double precision, double precision, text)` 存在，只授予 `authenticated`。节次外、未排班和公共假日分别抛出 `outside_shift_window`、`not_rostered`、`holiday`。
- `studio_geofence` 有且只有一行。`authenticated` 只有 SELECT。改围栏走 `update_studio_geofence`，半径 20–200 米，精度上限 30–200 米，并写入 `studio_geofence_audits`。
- `anon` 与 `authenticated` 不能直接 `INSERT`、`UPDATE` 或 `DELETE` `duty_logs`。作废走 `mark_duty_sign_in_invalid`，补签走 `admin_backfill_duty_sign_in`，删除走 `delete_duty_sign_in`。三者写入 `duty_sign_in_admin_events`。直接删除仍会留下 `action = 'delete'` 的行快照。
- `current_member_id()` 与 `is_current_admin()` 存在，且只授予 `authenticated`。
- `event_attendees_event_email_unique` 与 `duty_logs_member_sign_in_date_unique` 存在。
- `duty_leaves.leave_date`、`duty_leaves.expires_at`、`duty_swaps.leave_id`、`duty_compensations.compensation_date` 存在且非空。
- 公开的 `events` 桶没有 `Public Access` 或 `events_bucket_read` 这类宽泛 SELECT 策略。
