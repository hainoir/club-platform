-- Move studio leaderboard aggregation into Postgres so the dashboard does not
-- transfer and aggregate the complete studio_sessions history in Node.
-- Historical rows are retained; this migration does not archive or delete data.

create index if not exists studio_sessions_active_member_idx
  on public.studio_sessions (is_active, member_id);

create index if not exists studio_sessions_member_started_at_idx
  on public.studio_sessions (member_id, started_at desc);

create or replace function public.get_studio_study_leaderboard()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with params as (
  select
    statement_timestamp() as now_at,
    (statement_timestamp() at time zone 'Asia/Shanghai')::date as today_date
),
bounds as (
  select
    now_at,
    today_date::timestamp at time zone 'Asia/Shanghai' as today_start,
    (today_date - ((extract(isodow from today_date)::integer) - 1))::timestamp at time zone 'Asia/Shanghai' as week_start,
    date_trunc('month', today_date::timestamp) at time zone 'Asia/Shanghai' as month_start,
    case
      when extract(month from today_date) between 2 and 8
        then make_date(extract(year from today_date)::integer, 2, 1)::timestamp at time zone 'Asia/Shanghai'
      when extract(month from today_date) = 1
        then make_date(extract(year from today_date)::integer - 1, 9, 1)::timestamp at time zone 'Asia/Shanghai'
      else make_date(extract(year from today_date)::integer, 9, 1)::timestamp at time zone 'Asia/Shanghai'
    end as semester_start
  from params
),
valid_sessions as (
  select
    s.member_id,
    coalesce(nullif(trim(m.name), ''), '成员') as name,
    s.is_active,
    s.started_at,
    coalesce(s.ended_at, b.now_at) as ended_at,
    b.now_at,
    b.today_start,
    b.week_start,
    b.month_start,
    b.semester_start
  from public.studio_sessions s
  join bounds b on true
  left join public.members m on m.id = s.member_id
  where coalesce(s.ended_at, b.now_at) > s.started_at
),
member_stats as (
  select
    member_id,
    name,
    bool_or(is_active) as is_active,
    sum(floor(extract(epoch from greatest(least(ended_at, now_at) - greatest(started_at, today_start), interval '0')) / 60))::integer as today_minutes,
    sum(floor(extract(epoch from greatest(least(ended_at, now_at) - greatest(started_at, week_start), interval '0')) / 60))::integer as week_minutes,
    sum(floor(extract(epoch from greatest(least(ended_at, now_at) - greatest(started_at, month_start), interval '0')) / 60))::integer as month_minutes,
    sum(floor(extract(epoch from greatest(least(ended_at, now_at) - greatest(started_at, semester_start), interval '0')) / 60))::integer as semester_minutes,
    sum(floor(extract(epoch from ended_at - started_at) / 60))::integer as total_minutes
  from valid_sessions
  group by member_id, name
),
entries as (
  select
    member_id,
    name,
    is_active,
    today_minutes,
    week_minutes,
    month_minutes,
    semester_minutes,
    total_minutes,
    jsonb_build_object(
      'memberId', member_id,
      'name', name,
      'todayMinutes', today_minutes,
      'weekMinutes', week_minutes,
      'monthMinutes', month_minutes,
      'semesterMinutes', semester_minutes,
      'totalMinutes', total_minutes,
      'isActive', is_active
    ) as entry
  from member_stats
)
select jsonb_build_object(
  'activeCount', (select count(*)::integer from entries where is_active),
  'today', coalesce((
    select jsonb_agg(entry order by today_minutes desc, is_active desc, total_minutes desc, name asc)
    from entries where today_minutes > 0
  ), '[]'::jsonb),
  'week', coalesce((
    select jsonb_agg(entry order by week_minutes desc, is_active desc, total_minutes desc, name asc)
    from entries where week_minutes > 0
  ), '[]'::jsonb),
  'month', coalesce((
    select jsonb_agg(entry order by month_minutes desc, is_active desc, total_minutes desc, name asc)
    from entries where month_minutes > 0
  ), '[]'::jsonb),
  'semester', coalesce((
    select jsonb_agg(entry order by semester_minutes desc, is_active desc, total_minutes desc, name asc)
    from entries where semester_minutes > 0
  ), '[]'::jsonb),
  'total', coalesce((
    select jsonb_agg(entry order by total_minutes desc, is_active desc, total_minutes desc, name asc)
    from entries where total_minutes > 0
  ), '[]'::jsonb)
);
$$;

revoke all on function public.get_studio_study_leaderboard() from public, anon;
grant execute on function public.get_studio_study_leaderboard() to authenticated;
