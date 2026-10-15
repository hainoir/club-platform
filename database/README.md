# 数据库脚本已迁移

`database/*.sql` 里的松散脚本已经删除。权威定义现在是 Supabase CLI 迁移：

- 配置：`supabase/config.toml`
- 按时间戳排序的迁移：`supabase/migrations/`
- 本地与 CI 使用的种子数据：`supabase/seed.sql`
- 使用说明：`supabase/README.md`

这些迁移会在空库上重建同一份最终 schema、RLS、函数/RPC 和存储策略。`database/duty_signin_geofence.sql` 的全文原样放在 `supabase/migrations/20261015083723_duty_signin_geofence.sql`，版本号与生产库 `supabase_migrations.schema_migrations` 里已有的 `duty_signin_geofence` 记录相同。

旧的一次性数据回填（英文部门/年级、历史请假到期时间、E2E 钥匙交接清理、已废弃的 `accept_swap_rpc.sql`）不会在 `supabase db reset` 时重放。已经跑过那些脚本的托管库应保持现状；如果托管库还没跑过，对应 SQL 仍在 Git 历史的 `database/` 目录里。

不要对已经手工建表的生产库直接 `supabase db push` 这组基线迁移。做法见 `supabase/README.md`。

围栏之后的增量只有 `supabase/migrations/20261015092000_duty_sign_in_enforcement.sql`（节次窗口、签到列锁、作废与补签审计、围栏只读）。`database/` 不再保留它的副本。
