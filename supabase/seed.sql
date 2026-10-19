-- Local development and CI accounts. These passwords exist only in the disposable
-- database created by `supabase db reset`. Do not copy them into a hosted project.
--
-- The signup trigger always inserts members.role = '干事'. The admin row is
-- updated after the auth insert.

create or replace function public._seed_auth_user(
  p_id uuid,
  p_email text,
  p_password text,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_sso_user,
    is_anonymous
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  );

  insert into auth.identities (
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    p_id,
    jsonb_build_object(
      'sub', p_id::text,
      'email', p_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    p_id::text,
    now(),
    now(),
    now()
  );
end;
$$;

select public._seed_auth_user(
  '11111111-1111-4111-8111-111111111111',
  'e2e.member@club.local',
  'e2e-member-pass',
  'E2E 成员'
);

select public._seed_auth_user(
  '22222222-2222-4222-8222-222222222222',
  'e2e.admin@club.local',
  'e2e-admin-pass',
  'E2E 管理员'
);

select public._seed_auth_user(
  '33333333-3333-4333-8333-333333333333',
  'e2e.receiver@club.local',
  'e2e-receiver-pass',
  'E2E 接收人'
);

-- No duty_rosters. Self-study specs use this account so they stay eligible
-- after the member below is rostered.
select public._seed_auth_user(
  '55555555-5555-4555-8555-555555555555',
  'e2e.study@club.local',
  'e2e-study-pass',
  'E2E 自习'
);

update public.members
set role = '主席'
where id = '22222222-2222-4222-8222-222222222222';

insert into public.events (
  id,
  title,
  description,
  event_date,
  end_time,
  location,
  type,
  is_online
)
values (
  '44444444-4444-4444-8444-444444444444',
  'CI 报名活动',
  '本地与 CI 使用的尚未开始的活动。',
  now() + interval '7 days',
  now() + interval '7 days 2 hours',
  '工作室',
  '活动',
  false
);

drop function public._seed_auth_user(uuid, text, text, text);

-- E2E 成员 stands 第二节 (period 2, 10:05–11:40 Asia/Shanghai) Monday through Friday.
-- Playwright pins the browser Date to 10:30 on the real Shanghai date so the
-- dashboard button is enabled after that slot has ended. Monday 第一大节
-- (day_of_week 1, period 1) stays empty for auth-lock-reload.
-- This insert does not write duty_sign_in_clock. RPCs keep using now().
insert into public.duty_rosters (member_id, day_of_week, period, has_key)
select '11111111-1111-4111-8111-111111111111', day, 2, false
from generate_series(1, 5) as day;

-- BEGIN verify-local-duty-clock
-- Local and CI databases only. `supabase db reset` runs this file after migrations.
-- Hosted projects apply supabase/migrations and do not run seed.sql.
-- Do not copy this block into a migration. The production function in
-- 20261015092000_duty_sign_in_enforcement.sql does not read this table.
-- An empty table keeps duty_sign_in_instant() on now(). The verification
-- drive inserts one row as the database superuser, then deletes it.
-- authenticated and anon have no privileges here, and RLS has no policy.

create table if not exists public.duty_sign_in_clock (
  id boolean primary key default true check (id),
  clock_at timestamptz not null
);

alter table public.duty_sign_in_clock enable row level security;

revoke all on table public.duty_sign_in_clock from public, anon, authenticated;

create or replace function public.duty_sign_in_instant()
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_clock timestamptz;
  v_raw text;
begin
  select clock_at
  into v_clock
  from public.duty_sign_in_clock
  where id;

  if v_clock is not null then
    return v_clock;
  end if;

  if session_user in ('postgres', 'supabase_admin') then
    v_raw := nullif(current_setting('duty.sign_in_at', true), '');
    if v_raw is not null then
      return v_raw::timestamptz;
    end if;
  end if;

  return now();
end;
$$;

revoke all on function public.duty_sign_in_instant() from public, anon, authenticated;

-- duty_logs.sign_in_time defaults to now(), and the migration trigger keeps that
-- value. Stamp the local clock onto the row when a verification instant is set,
-- so the stored Shanghai date matches the instant the RPC already evaluated.
-- With no clock row this is the migration behavior: keep the supplied time, or now().
create or replace function public.sync_duty_sign_in_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_clock timestamptz;
begin
  select clock_at
  into v_clock
  from public.duty_sign_in_clock
  where id;

  if v_clock is not null then
    new.sign_in_time := v_clock;
  else
    new.sign_in_time := coalesce(new.sign_in_time, now());
  end if;

  new.sign_in_date := timezone('Asia/Shanghai', new.sign_in_time)::date;
  return new;
end;
$$;
-- END verify-local-duty-clock
