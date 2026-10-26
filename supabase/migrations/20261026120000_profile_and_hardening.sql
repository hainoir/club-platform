-- Post-baseline hardening for public profile, RSVP, and studio session writes.

-- ---------------------------------------------------------------------------
-- Studio session expiry uses database time only.
-- ---------------------------------------------------------------------------

drop function if exists public.expire_studio_sessions(timestamptz);

create or replace function public.expire_studio_sessions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_now_date date := (v_now at time zone 'Asia/Shanghai')::date;
  v_now_minutes integer := extract(hour from (v_now at time zone 'Asia/Shanghai'))::integer * 60
    + extract(minute from (v_now at time zone 'Asia/Shanghai'))::integer;
  v_expired_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  with active_sessions as (
    select
      s.id,
      (s.started_at at time zone 'Asia/Shanghai')::date as started_date,
      (
        extract(hour from (s.started_at at time zone 'Asia/Shanghai'))::integer * 60
        + extract(minute from (s.started_at at time zone 'Asia/Shanghai'))::integer
      ) as started_minutes
    from public.studio_sessions s
    where s.is_active = true
  ),
  expiration_rules as (
    select
      id,
      started_date,
      case
        when started_minutes between 450 and 575 then 585
        when started_minutes between 575 and 700 then 710
        when started_minutes between 780 and 905 then 915
        when started_minutes between 905 and 1030 then 1040
        else null
      end as expire_after_minutes
    from active_sessions
  )
  update public.studio_sessions s
  set
    is_active = false,
    ended_at = coalesce(s.ended_at, v_now)
  from expiration_rules r
  where s.id = r.id
    and r.expire_after_minutes is not null
    and (
      r.started_date < v_now_date
      or (
        r.started_date = v_now_date
        and v_now_minutes > r.expire_after_minutes
      )
    );

  get diagnostics v_expired_count = row_count;
  return v_expired_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RSVP deadline is enforced for every INSERT, including direct table writes.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_event_rsvp_after_deadline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deadline timestamptz;
begin
  select coalesce(
    e.end_time,
    (((e.event_date at time zone 'Asia/Shanghai')::date + 1)::timestamp at time zone 'Asia/Shanghai')
  )
  into v_deadline
  from public.events e
  where e.id = new.event_id;

  if v_deadline is null then
    raise exception 'Event not found';
  end if;

  if now() >= v_deadline then
    raise exception 'Event RSVP deadline has passed'
      using errcode = 'check_violation', hint = 'rsvp_deadline';
  end if;

  return new;
end;
$$;

drop trigger if exists event_attendees_deadline_guard on public.event_attendees;
create trigger event_attendees_deadline_guard
before insert on public.event_attendees
for each row
execute function public.prevent_event_rsvp_after_deadline();

-- ---------------------------------------------------------------------------
-- A member may have at most one active self-study session.
-- ---------------------------------------------------------------------------

with ranked_active_sessions as (
  select
    id,
    row_number() over (partition by member_id order by started_at desc, id desc) as session_rank
  from public.studio_sessions
  where is_active = true
)
update public.studio_sessions s
set is_active = false,
    ended_at = coalesce(s.ended_at, statement_timestamp())
from ranked_active_sessions r
where s.id = r.id
  and r.session_rank > 1;

create unique index if not exists studio_sessions_one_active_per_member
  on public.studio_sessions (member_id)
  where is_active = true;

create or replace function public.start_studio_session()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_session_id uuid;
begin
  if auth.uid() is null or v_member_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  if exists (
    select 1 from public.studio_sessions
    where member_id = v_member_id and is_active = true
  ) then
    raise exception 'An active studio session already exists'
      using errcode = 'unique_violation';
  end if;

  insert into public.studio_sessions (member_id)
  values (v_member_id)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.end_studio_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := public.current_member_id();
begin
  if auth.uid() is null or v_member_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  update public.studio_sessions
  set is_active = false,
      ended_at = coalesce(ended_at, statement_timestamp())
  where id = p_session_id
    and member_id = v_member_id
    and is_active = true;

  if not found then
    raise exception 'Active studio session not found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members may edit their own profile fields. Protected fields stay admin-only.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_member_protected_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_current_admin()
     and (
       new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.join_date is distinct from old.join_date
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Only admins may change protected member fields';
  end if;

  return new;
end;
$$;

drop trigger if exists members_protected_update_guard on public.members;
create trigger members_protected_update_guard
before update on public.members
for each row
execute function public.prevent_member_protected_update();

drop policy if exists members_update_self_profile on public.members;
create policy members_update_self_profile
on public.members for update
to authenticated
using (
  id = auth.uid()
  or lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
)
with check (
  id = auth.uid()
  or lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
);

-- Security-definer functions own the only write path for member sessions.
revoke insert, update on table public.studio_sessions from authenticated;

revoke all on function public.expire_studio_sessions() from public, anon;
grant execute on function public.expire_studio_sessions() to authenticated;

revoke all on function public.start_studio_session() from public, anon;
grant execute on function public.start_studio_session() to authenticated;

revoke all on function public.end_studio_session(uuid) from public, anon;
grant execute on function public.end_studio_session(uuid) to authenticated;

revoke all on function public.prevent_event_rsvp_after_deadline() from public, anon, authenticated;
revoke all on function public.prevent_member_protected_update() from public, anon, authenticated;
