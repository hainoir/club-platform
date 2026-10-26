# Supabase RPC 检查清单

在把值班或工作室相关 RPC 故障判断为前端 Bug 之前，请先过一遍这份清单。即使本地类型和 SQL 文件都正确，线上 Supabase 项目仍可能缺少函数，或者仍在提供过期的 PostgREST schema cache。

## 适用范围

- `approve_duty_leave(p_leave_id uuid)`
- `expire_studio_sessions(p_now timestamptz default now())`
- `submit_duty_sign_in(p_latitude double precision, p_longitude double precision, p_accuracy double precision, p_device_info text)`
- `current_member_id()`
- `mark_duty_sign_in_invalid(p_log_id uuid, p_reason text)`
- `admin_backfill_duty_sign_in(p_member_id uuid, p_sign_in_time timestamptz, p_reason text)`
- `update_studio_geofence(p_latitude double precision, p_longitude double precision, p_radius_meters double precision, p_max_accuracy_meters double precision, p_reason text)`
- `delete_duty_sign_in(p_log_id uuid, p_reason text)`

## 验证顺序

1. 确认目标 Supabase 项目里确实存在对应函数，且名称和参数列表符合预期。
2. 确认函数使用了 `SECURITY DEFINER SET search_path = public, pg_temp`。
3. 确认 `PUBLIC` 和 `anon` 没有执行权限，而 `authenticated` 具备执行权限。
4. 在应用或替换函数定义后，刷新 PostgREST schema cache。
5. 在修改 React Hook 或界面代码之前，先重新跑受影响的前端流程，确认 RPC 是否已经恢复正常。

## 建议执行的 SQL 检查

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'approve_duty_leave',
    'expire_studio_sessions',
    'submit_duty_sign_in',
    'current_member_id',
    'mark_duty_sign_in_invalid',
    'admin_backfill_duty_sign_in',
    'update_studio_geofence',
    'delete_duty_sign_in'
  );
```

```sql
select
  routine_name,
  security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'approve_duty_leave',
    'expire_studio_sessions',
    'submit_duty_sign_in',
    'current_member_id',
    'mark_duty_sign_in_invalid',
    'admin_backfill_duty_sign_in',
    'update_studio_geofence',
    'delete_duty_sign_in'
  );
```

```sql
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'approve_duty_leave',
    'expire_studio_sessions',
    'submit_duty_sign_in',
    'current_member_id',
    'mark_duty_sign_in_invalid',
    'admin_backfill_duty_sign_in',
    'update_studio_geofence',
    'delete_duty_sign_in'
  )
order by routine_name, grantee;
```

## 恢复说明

- 如果函数缺失或签名不一致，先把仓库里的 Supabase 迁移应用到目标库；只有在远端项目修正完成后，才运行 `pnpm run gen:types`。
- 如果函数存在，但应用仍报告 schema cache 不匹配，请触发 PostgREST schema cache 重载，或重启该项目的 Supabase API 服务。
- 如果数据库契约检查都通过了，而界面仍然报错，再同时检查前端调用点和网络响应体。
