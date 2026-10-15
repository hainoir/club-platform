-- Fresh-database baseline for the club platform.
-- The loose scripts in database/ assumed members/events already existed, then
-- altered them. This migration creates the final tables, constraints, and the
-- public events storage bucket in one pass.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- members / events
-- members.id matches auth.users.id when the signup trigger creates the row.
-- Admin-created members may exist without an auth user, so there is no FK.
-- ---------------------------------------------------------------------------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  role text not null default '干事',
  student_id text,
  department text,
  grade text,
  status text default 'active',
  join_date date default current_date,
  created_at timestamptz not null default now(),
  constraint members_email_key unique (email)
);

comment on column public.members.grade is '年级：大一/大二/大三/大四';

create unique index members_student_id_unique
  on public.members (student_id)
  where student_id is not null;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date timestamptz not null,
  end_time timestamptz,
  location text,
  type text,
  is_online boolean not null default false,
  cover_url text,
  created_at timestamptz not null default now()
);

create table public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_email text not null,
  user_name text not null,
  is_attended boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index event_attendees_event_email_unique
  on public.event_attendees (event_id, lower(user_email));

-- ---------------------------------------------------------------------------
-- duty
-- ---------------------------------------------------------------------------

create table public.duty_rosters (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  day_of_week int2 not null check (day_of_week between 1 and 5),
  period int2 not null check (period between 1 and 4),
  has_key boolean default false,
  created_at timestamptz not null default now(),
  unique (day_of_week, period, member_id)
);

comment on column public.duty_rosters.has_key is '该排班人员是否持有钥匙';

create table public.duty_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  sign_in_time timestamptz not null default now(),
  sign_in_date date not null default (timezone('Asia/Shanghai', now()))::date,
  location_verified boolean default false,
  device_info text,
  week_number int4
);

create unique index duty_logs_member_sign_in_date_unique
  on public.duty_logs (member_id, sign_in_date);

create table public.duty_leaves (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  day_of_week int2 not null check (day_of_week between 1 and 5),
  period int2 not null check (period between 1 and 4),
  leave_date date not null,
  -- Default is overwritten by set_duty_leave_expiry. It exists so clients can omit the column.
  expires_at timestamptz not null default now(),
  reason text,
  penalty_shifts int2 not null default 1 check (penalty_shifts between 1 and 2),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  constraint duty_leaves_date_matches_day
    check ((extract(isodow from leave_date))::int = day_of_week)
);

create table public.duty_swaps (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.members (id) on delete cascade,
  target_id uuid references public.members (id) on delete cascade,
  leave_id uuid,
  original_day int2 not null check (original_day between 1 and 5),
  original_period int2 not null check (original_period between 1 and 4),
  target_day int2 check (target_day between 1 and 5),
  target_period int2 check (target_period between 1 and 4),
  status text default 'pending',
  created_at timestamptz not null default now(),
  constraint duty_swaps_status_check
    check (status in ('pending', 'accepted', 'approved', 'rejected')),
  constraint duty_swaps_leave_id_fkey
    foreign key (leave_id) references public.duty_leaves (id) on delete cascade
);

create table public.duty_compensations (
  id uuid primary key default gen_random_uuid(),
  leave_id uuid not null references public.duty_leaves (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  compensation_date date not null,
  day_of_week int2 not null check (day_of_week between 1 and 5),
  period int2 not null check (period between 1 and 4),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.duty_compensations.compensation_date is '补班对应的具体日期（值班时区）';

create table public.key_transfers (
  id uuid primary key default gen_random_uuid(),
  from_member_id uuid references public.members (id) on delete set null,
  to_member_id uuid not null references public.members (id) on delete cascade,
  note text,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table public.studio_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_active boolean not null default true
);

-- Bucket row is also declared in config.toml. Inserting it here keeps db reset
-- self-contained even if bucket config is applied after migrations.
insert into storage.buckets (id, name, public)
values ('events', 'events', true)
on conflict (id) do update
set public = excluded.public;
