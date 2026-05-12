# 数据库迁移指南

本项目采用 SQL 优先的迁移方式。为了避免 schema 漂移，请严格按照顺序执行这些文件。

## 事实来源

- `database/update_swap_status.sql` 是值班代班 RPC 行为的最终事实来源，覆盖：
  `public.accept_duty_swap`、`public.volunteer_for_duty_swap` 和 `public.return_duty_swap_to_hall`。
- `database/fix_duty_hall_permissions.sql` 会有意镜像这些 RPC 定义，用于角色与邮箱兼容性加固，必须与之保持同步。
- `database/accept_swap_rpc.sql` 已废弃，并且不会定义 RPC 行为。
- `database/studio_sessions_schema.sql` 负责 `public.expire_studio_sessions`，它是关闭过期自习在场记录的 RPC 边界。

## 全新环境执行顺序

1. `database/auth_trigger.sql`
2. `database/rls_policies.sql`
3. `database/duty_schema.sql`
4. `database/key_and_leave_schema.sql`
5. `database/studio_sessions_schema.sql`
6. `database/update_swap_status.sql`
7. `database/add_signin_and_rsvp_constraints.sql`（必需的加固：签到去重与 RSVP 唯一性）
8. `database/fix_duty_hall_permissions.sql`（值班大厅的角色/邮箱兼容性加固）
9. `database/security_linter_hardening.sql`（针对函数授权与公开存储列举的 Supabase 数据库检查器加固）

## 增量升级顺序（已有环境）

1. `database/normalize_profile_fields_to_zh.sql`（一次性回填 `public.members` 与 `auth.users.raw_user_meta_data` 中历史英文 `department`/`grade` 值）
2. `database/key_and_leave_schema.sql`（新增 `duty_swaps.leave_id`、请假审批 RPC 与仅已批准请假可见性的约束）
3. `database/update_swap_status.sql`（刷新代班审批、接单和退回大厅相关 RPC）
4. `database/fix_duty_hall_permissions.sql`（加固值班大厅策略与 RPC 的角色/邮箱兼容性）
5. 只有在你改动了成员或活动相关策略时，才重新应用 `database/rls_policies.sql`。
6. 当自习在场清理行为有变化时，重新应用 `database/studio_sessions_schema.sql`。
7. 任何会重建 `SECURITY DEFINER` 函数或存储策略的 SQL 变更之后，都要补跑 `database/security_linter_hardening.sql`。

## 回滚说明（安全加固）

只有在必须快速回退行为时才使用，并请在 Supabase SQL Editor 中谨慎执行。

```sql
-- 1) 回退 duty_swaps 的状态约束
ALTER TABLE public.duty_swaps DROP CONSTRAINT IF EXISTS duty_swaps_status_check;
ALTER TABLE public.duty_swaps ADD CONSTRAINT duty_swaps_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 2) 移除加固后的授权（accept_duty_swap）
REVOKE ALL ON FUNCTION public.accept_duty_swap(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_duty_swap(uuid, uuid) TO public;

-- 3) 移除加固后的授权（confirm_key_transfer）
REVOKE ALL ON FUNCTION public.confirm_key_transfer(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_key_transfer(uuid, uuid) TO public;
```

## 校验清单

- `duty_swaps.status` 只接受：`pending`、`accepted`、`approved`、`rejected`。
- `accept_duty_swap` 必须拒绝非管理员调用者。
- `volunteer_for_duty_swap` 只能接受公共或定向给自己的待处理代班。
- `return_duty_swap_to_hall` 需要清空 `target_id`，并把定向/已接单代班退回到公共待处理状态。
- `approve_duty_leave` 只批准未关联代班的待审批请假。
- `confirm_key_transfer` 必须拒绝非接收方调用者。
- 函数定义必须包含：`SECURITY DEFINER SET search_path = public, pg_temp`。
- `event_attendees_event_email_unique` 必须存在，以保证每个活动/邮箱只有一条 RSVP 记录（大小写不敏感）。
- `duty_logs_member_sign_in_date_unique` 必须存在，以阻止同一天重复签到。
- `duty_swaps.leave_id` 必须存在，并且历史 `duty_leaves.status='pending'` 数据已回填为 `approved`。
- `duty_leaves` 的 `pending` 行仅对本人和管理员可见；已批准记录对所有人保持可见。
- `duty_compensations.compensation_date` 必须存在，并且历史数据已完成回填。
- `members.department` / `members.grade` 以及 `auth.users.raw_user_meta_data` 中不应再保留历史英文枚举值。
- `expire_studio_sessions` 必须存在、可被 `authenticated` 执行，并且客户端应通过它而不是在读取活跃自习列表时直接更新过期行。
- 公开的 `events` bucket 不应保留类似 `Public Access` 或 `events_bucket_read` 这类宽泛的 `storage.objects` SELECT 策略。
- 仅供触发器或维护使用的函数不应允许 `anon` 或 `authenticated` 直接执行；面向客户端的 RPC 也不应允许 `anon` 执行。
