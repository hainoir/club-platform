-- Final function and trigger definitions.
-- Overlapping copies in the old scripts (update_swap_status.sql and
-- fix_duty_hall_permissions.sql) agreed on these bodies; only that version is kept.

-- ---------------------------------------------------------------------------
-- Auth: copy a new auth.users row into public.members
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.members (
    id,
    email,
    name,
    role,
    student_id,
    department,
    grade,
    status,
    join_date
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', '新成员'),
    '干事',
    nullif(new.raw_user_meta_data->>'student_id', '')::bigint,
    new.raw_user_meta_data->>'department',
    new.raw_user_meta_data->>'grade',
    'active',
    current_date
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Duty sign-in date stays aligned with the Shanghai-local calendar day
-- ---------------------------------------------------------------------------

create or replace function public.sync_duty_sign_in_date()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.sign_in_time := coalesce(new.sign_in_time, now());
  new.sign_in_date := timezone('Asia/Shanghai', new.sign_in_time)::date;
  return new;
end;
$$;

drop trigger if exists trg_sync_duty_sign_in_date on public.duty_logs;
create trigger trg_sync_duty_sign_in_date
before insert or update of sign_in_time on public.duty_logs
for each row
execute function public.sync_duty_sign_in_date();

-- ---------------------------------------------------------------------------
-- Leave expiry is owned by the database (Asia/Shanghai period end)
-- ---------------------------------------------------------------------------

create or replace function public.set_duty_leave_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  period_end time;
begin
  case new.period
    when 1 then period_end := time '09:35';
    when 2 then period_end := time '11:40';
    when 3 then period_end := time '15:05';
    when 4 then period_end := time '17:10';
    else raise exception 'Invalid duty period: %', new.period;
  end case;

  if (extract(isodow from new.leave_date))::int <> new.day_of_week then
    raise exception 'leave_date weekday must match day_of_week';
  end if;

  new.expires_at := (new.leave_date + period_end) at time zone 'Asia/Shanghai';
  if new.expires_at <= statement_timestamp() then
    raise exception 'Duty leave must end in the future';
  end if;

  return new;
end;
$$;

create or replace function public.guard_duty_leave_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.expires_at := old.expires_at;
  return new;
end;
$$;

create or replace function public.prevent_expired_duty_leave_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved'
     and old.status is distinct from 'approved'
     and old.expires_at <= statement_timestamp() then
    raise exception 'Expired duty leave cannot be approved';
  end if;
  return new;
end;
$$;

drop trigger if exists duty_leaves_guard_expiry on public.duty_leaves;
create trigger duty_leaves_guard_expiry
before update of expires_at on public.duty_leaves
for each row
execute function public.guard_duty_leave_expiry();

drop trigger if exists duty_leaves_prevent_expired_approval on public.duty_leaves;
create trigger duty_leaves_prevent_expired_approval
before update of status on public.duty_leaves
for each row
execute function public.prevent_expired_duty_leave_approval();

drop trigger if exists duty_leaves_set_expiry on public.duty_leaves;
create trigger duty_leaves_set_expiry
before insert or update of leave_date, period on public.duty_leaves
for each row
execute function public.set_duty_leave_expiry();

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

create or replace function public.confirm_key_transfer(p_transfer_id uuid, p_confirmer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.key_transfers%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  if v_actor_id <> p_confirmer_id then
    raise exception 'Forbidden: confirmer must match current user';
  end if;

  select * into v_transfer
  from public.key_transfers
  where id = p_transfer_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Key transfer not found or already confirmed';
  end if;

  if v_transfer.to_member_id <> v_actor_id then
    raise exception 'Forbidden: only transfer receiver can confirm';
  end if;

  update public.key_transfers
  set status = 'confirmed', confirmed_at = now()
  where id = p_transfer_id;

  update public.duty_rosters
  set has_key = false
  where member_id = v_transfer.from_member_id;

  update public.duty_rosters
  set has_key = true
  where member_id = v_transfer.to_member_id;

  raise log 'confirm_key_transfer by % for transfer %', v_actor_id, p_transfer_id;
end;
$$;

create or replace function public.approve_duty_leave(p_leave_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_leave public.duty_leaves%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  if not exists (
    select 1
    from public.members admin
    where (
      admin.id = v_actor_id
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  ) then
    raise exception 'Forbidden: only admins can approve leave requests';
  end if;

  select *
  into v_leave
  from public.duty_leaves
  where id = p_leave_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Leave request not found or already approved';
  end if;

  if exists (
    select 1
    from public.duty_swaps
    where leave_id = v_leave.id
  ) then
    raise exception 'Leave request must be approved through the linked swap workflow';
  end if;

  update public.duty_leaves
  set status = 'approved'
  where id = v_leave.id;

  raise log 'approve_duty_leave approved by % for leave %', v_actor_id, p_leave_id;
end;
$$;

create or replace function public.accept_duty_swap(
  p_swap_id uuid,
  p_acceptor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.duty_swaps%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  if not exists (
    select 1
    from public.members admin
    where (
      admin.id = v_actor_id
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  ) then
    raise exception 'Forbidden: only admins can approve swap requests';
  end if;

  select *
  into v_swap
  from public.duty_swaps
  where id = p_swap_id
    and status = 'accepted'
  for update;

  if not found then
    raise exception 'Swap request not found or status is not accepted';
  end if;

  if v_swap.target_id is null then
    raise exception 'Swap request has no accepted target';
  end if;

  if v_swap.target_id <> p_acceptor_id then
    raise exception 'Acceptor mismatch: expected %, got %', v_swap.target_id, p_acceptor_id;
  end if;

  delete from public.duty_rosters
  where member_id = v_swap.requester_id
    and day_of_week = v_swap.original_day
    and period = v_swap.original_period;

  insert into public.duty_rosters (member_id, day_of_week, period)
  values (v_swap.target_id, v_swap.original_day, v_swap.original_period);

  update public.duty_swaps
  set status = 'approved'
  where id = p_swap_id;

  if v_swap.leave_id is not null then
    update public.duty_leaves
    set status = 'approved'
    where id = v_swap.leave_id;
  end if;

  raise log 'accept_duty_swap approved by % for swap % -> target %', v_actor_id, p_swap_id, p_acceptor_id;
end;
$$;

create or replace function public.volunteer_for_duty_swap(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.duty_swaps%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  select *
  into v_swap
  from public.duty_swaps
  where id = p_swap_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Swap request not found or no longer pending';
  end if;

  if v_swap.requester_id = v_actor_id then
    raise exception 'Forbidden: requester cannot volunteer for own swap';
  end if;

  if v_swap.target_id is not null and v_swap.target_id <> v_actor_id then
    raise exception 'Forbidden: swap request is reserved for another member';
  end if;

  update public.duty_swaps
  set target_id = v_actor_id,
      status = 'accepted'
  where id = p_swap_id;

  raise log 'volunteer_for_duty_swap accepted by % for swap %', v_actor_id, p_swap_id;
end;
$$;

create or replace function public.return_duty_swap_to_hall(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_swap public.duty_swaps%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Unauthorized: login required';
  end if;

  select *
  into v_swap
  from public.duty_swaps
  where id = p_swap_id
    and status in ('pending', 'accepted')
  for update;

  if not found then
    raise exception 'Swap request not found or cannot be returned';
  end if;

  if v_swap.target_id is null and v_swap.status = 'pending' then
    raise exception 'Swap request is already public';
  end if;

  if not (
    v_swap.requester_id = v_actor_id
    or v_swap.target_id = v_actor_id
    or exists (
      select 1
      from public.members admin
      where (
        admin.id = v_actor_id
        or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      )
        and (
          lower(trim(admin.role)) = 'admin'
          or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
        )
    )
  ) then
    raise exception 'Forbidden: only requester, target, or admin can return the swap';
  end if;

  update public.duty_swaps
  set target_id = null,
      status = 'pending'
  where id = p_swap_id;

  raise log 'return_duty_swap_to_hall by % for swap %', v_actor_id, p_swap_id;
end;
$$;

create or replace function public.expire_studio_sessions(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now_date date := (p_now at time zone 'Asia/Shanghai')::date;
  v_now_minutes integer := extract(hour from (p_now at time zone 'Asia/Shanghai'))::integer * 60
    + extract(minute from (p_now at time zone 'Asia/Shanghai'))::integer;
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
    ended_at = coalesce(s.ended_at, p_now)
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
