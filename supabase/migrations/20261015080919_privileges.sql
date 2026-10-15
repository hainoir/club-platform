-- Grants and revokes from security_linter_hardening.sql, applied to the
-- functions this baseline actually creates. The loop also covers historical
-- function names that may exist on an older hosted database but are not
-- defined here.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

-- 1) Pin search_path on security-definer helpers that may predate this baseline.
do $$
declare
  function_signature text;
begin
  for function_signature in
    select *
    from (
      values
        ('public.get_user_role(text)'),
        ('public.handle_new_user()')
    ) as signatures(name)
    where to_regprocedure(signatures.name) is not null
  loop
    execute format('alter function %s set search_path = public, pg_temp', function_signature);
  end loop;
end;
$$;

-- 2) Drop broad storage SELECT policies if a restored dump still has them.
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "events_bucket_read" on storage.objects;

-- 3) Revoke anon and PUBLIC execute on security-definer functions.
do $$
declare
  function_signature text;
begin
  for function_signature in
    select *
    from (
      values
        ('public.accept_duty_swap(uuid, uuid)'),
        ('public.approve_duty_leave(uuid)'),
        ('public.confirm_key_transfer(uuid, uuid)'),
        ('public.current_member_id()'),
        ('public.expire_studio_sessions(timestamptz)'),
        ('public.get_user_role(text)'),
        ('public.guard_duty_leave_expiry()'),
        ('public.handle_new_user()'),
        ('public.is_current_admin()'),
        ('public.prevent_expired_duty_leave_approval()'),
        ('public.return_duty_swap_to_hall(uuid)'),
        ('public.rls_auto_enable()'),
        ('public.set_duty_leave_expiry()'),
        ('public.sync_duty_sign_in_date()'),
        ('public.volunteer_for_duty_swap(uuid)')
    ) as signatures(name)
    where to_regprocedure(signatures.name) is not null
  loop
    execute format('revoke all on function %s from public', function_signature);
    execute format('revoke all on function %s from anon', function_signature);
  end loop;
end;
$$;

-- 4) Trigger and maintenance functions are not client RPCs.
do $$
declare
  function_signature text;
begin
  for function_signature in
    select *
    from (
      values
        ('public.guard_duty_leave_expiry()'),
        ('public.handle_new_user()'),
        ('public.prevent_expired_duty_leave_approval()'),
        ('public.rls_auto_enable()'),
        ('public.set_duty_leave_expiry()'),
        ('public.sync_duty_sign_in_date()')
    ) as signatures(name)
    where to_regprocedure(signatures.name) is not null
  loop
    execute format('revoke all on function %s from authenticated', function_signature);
  end loop;
end;
$$;

-- 5) Client RPCs stay callable by signed-in users. Each function checks the caller.
do $$
declare
  function_signature text;
begin
  for function_signature in
    select *
    from (
      values
        ('public.accept_duty_swap(uuid, uuid)'),
        ('public.approve_duty_leave(uuid)'),
        ('public.confirm_key_transfer(uuid, uuid)'),
        ('public.expire_studio_sessions(timestamptz)'),
        ('public.return_duty_swap_to_hall(uuid)'),
        ('public.volunteer_for_duty_swap(uuid)')
    ) as signatures(name)
    where to_regprocedure(signatures.name) is not null
  loop
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;
