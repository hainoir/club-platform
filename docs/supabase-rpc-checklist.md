# Supabase RPC Checklist

Use this checklist before treating a duty or studio RPC failure as a frontend bug. Local types and SQL files can be correct while the deployed Supabase project is still missing the function or serving a stale PostgREST schema cache.

## Scope

- `approve_duty_leave(p_leave_id uuid)`
- `expire_studio_sessions(p_now timestamptz default now())`

## Verification Order

1. Confirm the function exists in the target Supabase project with the expected name and parameter list.
2. Confirm the function uses `SECURITY DEFINER SET search_path = public, pg_temp`.
3. Confirm `PUBLIC` and `anon` do not have execute access, and `authenticated` does.
4. Refresh the PostgREST schema cache after applying or replacing the function definition.
5. Re-run the affected frontend flow and confirm the RPC no longer fails before changing React hooks or UI code.

## Suggested SQL Checks

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('approve_duty_leave', 'expire_studio_sessions');
```

```sql
select
  routine_name,
  security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in ('approve_duty_leave', 'expire_studio_sessions');
```

```sql
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('approve_duty_leave', 'expire_studio_sessions')
order by routine_name, grantee;
```

## Recovery Notes

- If the function is missing or the signature differs, apply the repo SQL first and then regenerate local types only after the remote project is correct.
- If the function exists but the app still reports a schema-cache mismatch, trigger a PostgREST schema cache reload or restart the Supabase API service for that project.
- If the database contract checks pass and the UI still fails, then inspect the frontend call site and the network response body together.
