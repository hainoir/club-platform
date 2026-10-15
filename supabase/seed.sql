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
