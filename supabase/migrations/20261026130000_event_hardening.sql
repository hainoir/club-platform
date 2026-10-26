-- Event privacy, member keyed RSVPs, and data integrity hardening.

alter table public.event_attendees
  add column if not exists member_id uuid references public.members (id) on delete cascade;

update public.event_attendees attendee
set member_id = member.id
from public.members member
where attendee.member_id is null
  and lower(trim(attendee.user_email)) = lower(trim(member.email));

create unique index if not exists event_attendees_event_member_unique
  on public.event_attendees (event_id, member_id)
  where member_id is not null;

-- Existing invalid end times cannot be retained once the invariant is enforced.
update public.events
set end_time = null
where end_time is not null and end_time <= event_date;

alter table public.events
  drop constraint if exists events_end_after_start;
alter table public.events
  add constraint events_end_after_start
  check (end_time is null or end_time > event_date);

drop policy if exists "允许认证用户读取活动参与者列表" on public.event_attendees;
drop policy if exists "允许认证用户自行报名或管理员操作" on public.event_attendees;
drop policy if exists "允许认证用户取消报名或管理员操作" on public.event_attendees;

create policy event_attendees_select_member_or_admin
on public.event_attendees for select
to authenticated
using (
  public.is_current_admin()
  or member_id = public.current_member_id()
  or (
    member_id is null
    and lower(trim(user_email)) = lower(trim(auth.jwt()->>'email'))
  )
);

create policy event_attendees_insert_self_or_admin
on public.event_attendees for insert
to authenticated
with check (
  public.is_current_admin()
  or (
    (
      member_id = public.current_member_id()
      or (
        member_id is null
        and lower(trim(auth.jwt()->>'email')) = lower(trim(user_email))
      )
    )
    and lower(trim(auth.jwt()->>'email')) = lower(trim(user_email))
  )
);

create policy event_attendees_delete_self_or_admin
on public.event_attendees for delete
to authenticated
using (
  public.is_current_admin()
  or member_id = public.current_member_id()
  or (
    member_id is null
    and lower(trim(user_email)) = lower(trim(auth.jwt()->>'email'))
  )
);

-- Counts are not private, while attendee rows and their email addresses are.
create or replace function public.get_event_attendee_counts()
returns table (event_id uuid, attendee_count bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select ea.event_id, count(*)::bigint
  from public.event_attendees ea
  where auth.uid() is not null
  group by ea.event_id;
$$;

revoke all on function public.get_event_attendee_counts() from public, anon;
grant execute on function public.get_event_attendee_counts() to authenticated;
