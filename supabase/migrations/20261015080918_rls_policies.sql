-- Final RLS policies.
-- Where a later script replaced a policy, only the replacement is created.
-- Where a later script added a v2 policy without dropping the original, both
-- remain, matching a database that applied the loose scripts in order.
-- Permissive policies are OR-ed, so the v2 policy is the effective rule.

alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.duty_rosters enable row level security;
alter table public.duty_logs enable row level security;
alter table public.duty_swaps enable row level security;
alter table public.duty_leaves enable row level security;
alter table public.duty_compensations enable row level security;
alter table public.key_transfers enable row level security;
alter table public.studio_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------

create policy "允许认证用户读取所有成员信息"
on public.members for select
to authenticated
using (true);

create policy "允许管理员更新成员"
on public.members for update
to authenticated
using (
  exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "允许管理员插入成员"
on public.members for insert
to authenticated
with check (
  exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "允许新用户自助注册记录"
on public.members for insert
to authenticated
with check (
  email = auth.jwt()->>'email'
  and role in ('member', '干事')
);

create policy "允许管理员删除成员"
on public.members for delete
to authenticated
using (
  exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create policy "允许任何人/认证用户读取活动"
on public.events for select
to authenticated
using (true);

create policy "允许管理员更新活动"
on public.events for update
to authenticated
using (
  exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "允许管理员插入活动"
on public.events for insert
to authenticated
with check (
  exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "允许管理员删除活动"
on public.events for delete
to authenticated
using (
  exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

-- ---------------------------------------------------------------------------
-- event_attendees
-- ---------------------------------------------------------------------------

create policy "允许认证用户读取活动参与者列表"
on public.event_attendees for select
to authenticated
using (true);

create policy "允许认证用户自行报名或管理员操作"
on public.event_attendees for insert
to authenticated
with check (
  lower(trim(auth.jwt()->>'email')) = lower(trim(user_email))
  or exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "允许认证用户取消报名或管理员操作"
on public.event_attendees for delete
to authenticated
using (
  lower(trim(auth.jwt()->>'email')) = lower(trim(user_email))
  or exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "仅允许管理员更新报名状态"
on public.event_attendees for update
to authenticated
using (
  exists (
    select 1 from public.members as admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

-- ---------------------------------------------------------------------------
-- storage.objects (events bucket)
-- A public bucket serves object URLs without a SELECT policy. The broad
-- SELECT policies are intentionally absent so clients cannot list the bucket.
-- ---------------------------------------------------------------------------

create policy "events_bucket_insert_admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'events'
  and exists (
    select 1 from public.members m
    where lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      and m.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "events_bucket_update_admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'events'
  and exists (
    select 1 from public.members m
    where lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      and m.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
)
with check (
  bucket_id = 'events'
  and exists (
    select 1 from public.members m
    where lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      and m.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "events_bucket_delete_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'events'
  and exists (
    select 1 from public.members m
    where lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      and m.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

-- ---------------------------------------------------------------------------
-- duty_rosters
-- ---------------------------------------------------------------------------

create policy "允许认证用户查看值班表"
on public.duty_rosters for select
to authenticated
using (true);

create policy "允许自己报名或管理员排班"
on public.duty_rosters for insert
to authenticated
with check (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  or exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

create policy "duty_rosters_insert_owner_or_admin_v2"
on public.duty_rosters for insert
to authenticated
with check (
  exists (
    select 1
    from public.members m
    where m.id = member_id
      and (
        m.id = auth.uid()
        or lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
  or exists (
    select 1
    from public.members admin
    where (
      admin.id = auth.uid()
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

create policy "允许自己取消或管理员删除排班"
on public.duty_rosters for delete
to authenticated
using (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  or exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

create policy "duty_rosters_delete_owner_or_admin_v2"
on public.duty_rosters for delete
to authenticated
using (
  exists (
    select 1
    from public.members m
    where m.id = member_id
      and (
        m.id = auth.uid()
        or lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
  or exists (
    select 1
    from public.members admin
    where (
      admin.id = auth.uid()
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

create policy "允许管理员修改排班"
on public.duty_rosters for update
to authenticated
using (
  exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
)
with check (
  exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

create policy "duty_rosters_update_admin_v2"
on public.duty_rosters for update
to authenticated
using (
  exists (
    select 1
    from public.members admin
    where (
      admin.id = auth.uid()
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
)
with check (
  exists (
    select 1
    from public.members admin
    where (
      admin.id = auth.uid()
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

-- ---------------------------------------------------------------------------
-- duty_logs
-- ---------------------------------------------------------------------------

create policy "允许认证用户查看打卡记录"
on public.duty_logs for select
to authenticated
using (true);

create policy "允许自己提交打卡"
on public.duty_logs for insert
to authenticated
with check (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

create policy "仅允许管理员修改打卡记录"
on public.duty_logs for update
to authenticated
using (
  exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
)
with check (
  exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

create policy "仅允许管理员删除打卡记录"
on public.duty_logs for delete
to authenticated
using (
  exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

-- ---------------------------------------------------------------------------
-- duty_swaps
-- ---------------------------------------------------------------------------

create policy "duty_swaps_select_visible_v2"
on public.duty_swaps for select
to authenticated
using (
  status = 'approved'
  or (status = 'pending' and target_id is null)
  or exists (
    select 1
    from public.members m
    where m.id in (requester_id, target_id)
      and (
        m.id = auth.uid()
        or lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
  or exists (
    select 1
    from public.members admin
    where (
      admin.id = auth.uid()
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

create policy "允许发起换班申请"
on public.duty_swaps for insert
to authenticated
with check (
  exists (
    select 1 from public.members m
    where m.id = requester_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

create policy "允许相关方修改换班状态"
on public.duty_swaps for update
to authenticated
using (
  exists (
    select 1 from public.members m
    where m.id in (requester_id, target_id) and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  or exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
)
with check (
  exists (
    select 1 from public.members m
    where m.id in (requester_id, target_id) and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  or exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

create policy "允许自己撤回或管理员删除换班请求"
on public.duty_swaps for delete
to authenticated
using (
  exists (
    select 1 from public.members m
    where m.id = requester_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  or exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

-- ---------------------------------------------------------------------------
-- duty_leaves / duty_compensations / key_transfers
-- ---------------------------------------------------------------------------

create policy "duty_leaves_select_visible_v2"
on public.duty_leaves for select
to authenticated
using (
  status = 'approved'
  or exists (
    select 1
    from public.members m
    where m.id = member_id
      and (
        m.id = auth.uid()
        or lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
  or exists (
    select 1
    from public.members admin
    where (
      admin.id = auth.uid()
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

create policy "允许本人提交请假"
on public.duty_leaves for insert
to authenticated
with check (
  exists (
    select 1 from public.members m
    where m.id = member_id
      and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  and exists (
    select 1
    from public.duty_rosters roster
    where roster.member_id = public.duty_leaves.member_id
      and roster.day_of_week = public.duty_leaves.day_of_week
      and roster.period = public.duty_leaves.period
  )
);

create policy "允许管理员或本人操作请假"
on public.duty_leaves for update
to authenticated
using (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  or exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
)
with check (
  (
    exists (
      select 1 from public.members m
      where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
    )
    or exists (
      select 1 from public.members admin
      where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
        and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
    )
  )
  and exists (
    select 1
    from public.duty_rosters roster
    where roster.member_id = public.duty_leaves.member_id
      and roster.day_of_week = public.duty_leaves.day_of_week
      and roster.period = public.duty_leaves.period
  )
);

create policy "允许管理员或本人删除请假"
on public.duty_leaves for delete
to authenticated
using (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  or exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '主席', '执行主席', '副主席', '部长', '管理员')
  )
);

create policy "duty_compensations_select_visible_v2"
on public.duty_compensations for select
to authenticated
using (
  exists (
    select 1
    from public.duty_leaves l
    where l.id = leave_id
      and (
        l.status = 'approved'
        or exists (
          select 1
          from public.members m
          where m.id = l.member_id
            and (
              m.id = auth.uid()
              or lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
            )
        )
        or exists (
          select 1
          from public.members admin
          where (
            admin.id = auth.uid()
            or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
          )
            and (
              lower(trim(admin.role)) = 'admin'
              or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
            )
        )
      )
  )
);

create policy "允许本人提交补班"
on public.duty_compensations for insert
to authenticated
with check (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

create policy "允许认证用户查看钥匙交接"
on public.key_transfers for select
to authenticated
using (true);

create policy "允许本人发起钥匙交接"
on public.key_transfers for insert
to authenticated
with check (
  exists (
    select 1 from public.members m
    where m.id = from_member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

create policy "允许相关方更新钥匙交接"
on public.key_transfers for update
to authenticated
using (
  exists (
    select 1 from public.members m
    where m.id in (from_member_id, to_member_id)
      and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

-- ---------------------------------------------------------------------------
-- studio_sessions
-- ---------------------------------------------------------------------------

create policy "允许认证用户查看自习"
on public.studio_sessions for select
to authenticated
using (true);

create policy "允许本人开始自习"
on public.studio_sessions for insert
to authenticated
with check (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

create policy "studio_sessions_insert_owner_v2"
on public.studio_sessions for insert
to authenticated
with check (
  exists (
    select 1
    from public.members m
    where m.id = member_id
      and (
        m.id = auth.uid()
        or lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
);

create policy "允许本人结束自习"
on public.studio_sessions for update
to authenticated
using (
  exists (
    select 1 from public.members m
    where m.id = member_id and lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

create policy "studio_sessions_update_owner_v2"
on public.studio_sessions for update
to authenticated
using (
  exists (
    select 1
    from public.members m
    where m.id = member_id
      and (
        m.id = auth.uid()
        or lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
);

create policy "允许管理员删除自习记录"
on public.studio_sessions for delete
to authenticated
using (
  exists (
    select 1 from public.members admin
    where lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      and admin.role in ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);

create policy "studio_sessions_delete_admin_v2"
on public.studio_sessions for delete
to authenticated
using (
  exists (
    select 1
    from public.members admin
    where (
      admin.id = auth.uid()
      or lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      and (
        lower(trim(admin.role)) = 'admin'
        or trim(admin.role) in ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);
