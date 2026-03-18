-- ==========================================================
-- 修复：值班大厅权限兼容性
-- 目的：
-- 1）让角色校验兼容“管理员”别名与英文管理员角色的大小写变体
-- 2）让邮箱比较忽略大小写并自动去除首尾空白
-- 3）恢复值班排班、钥匙与自习流程的写入权限
-- ==========================================================

-- ------------------------------------------------------------------
-- 排班池：本人或管理员可插入和删除，管理员可更新
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS duty_rosters_insert_owner_or_admin_v2 ON public.duty_rosters;
CREATE POLICY duty_rosters_insert_owner_or_admin_v2
ON public.duty_rosters FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = member_id
      AND (
        m.id = auth.uid()
        OR lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = auth.uid()
      OR lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      AND (
        lower(trim(admin.role)) = 'admin'
        OR trim(admin.role) IN ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

DROP POLICY IF EXISTS duty_rosters_delete_owner_or_admin_v2 ON public.duty_rosters;
CREATE POLICY duty_rosters_delete_owner_or_admin_v2
ON public.duty_rosters FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = member_id
      AND (
        m.id = auth.uid()
        OR lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = auth.uid()
      OR lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      AND (
        lower(trim(admin.role)) = 'admin'
        OR trim(admin.role) IN ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

DROP POLICY IF EXISTS duty_rosters_update_admin_v2 ON public.duty_rosters;
CREATE POLICY duty_rosters_update_admin_v2
ON public.duty_rosters FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = auth.uid()
      OR lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      AND (
        lower(trim(admin.role)) = 'admin'
        OR trim(admin.role) IN ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = auth.uid()
      OR lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      AND (
        lower(trim(admin.role)) = 'admin'
        OR trim(admin.role) IN ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

-- ------------------------------------------------------------------
-- 自习会话：本人可插入和更新，管理员可删除
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS studio_sessions_insert_owner_v2 ON public.studio_sessions;
CREATE POLICY studio_sessions_insert_owner_v2
ON public.studio_sessions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = member_id
      AND (
        m.id = auth.uid()
        OR lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
);

DROP POLICY IF EXISTS studio_sessions_update_owner_v2 ON public.studio_sessions;
CREATE POLICY studio_sessions_update_owner_v2
ON public.studio_sessions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = member_id
      AND (
        m.id = auth.uid()
        OR lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
      )
  )
);

DROP POLICY IF EXISTS studio_sessions_delete_admin_v2 ON public.studio_sessions;
CREATE POLICY studio_sessions_delete_admin_v2
ON public.studio_sessions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = auth.uid()
      OR lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      AND (
        lower(trim(admin.role)) = 'admin'
        OR trim(admin.role) IN ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  )
);

-- ------------------------------------------------------------------
-- 换班审批函数：管理员兼容处理
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_duty_swap(
  p_swap_id uuid,
  p_acceptor_id uuid
)
RETURNS void AS $$
DECLARE
  v_swap public.duty_swaps%ROWTYPE;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = v_actor_id
      OR lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
    )
      AND (
        lower(trim(admin.role)) = 'admin'
        OR trim(admin.role) IN ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden: only admins can approve swap requests';
  END IF;

  SELECT * INTO v_swap
  FROM public.duty_swaps
  WHERE id = p_swap_id
    AND status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap request not found or status is not accepted';
  END IF;

  IF v_swap.target_id IS NULL THEN
    RAISE EXCEPTION 'Swap request has no accepted target';
  END IF;

  IF v_swap.target_id <> p_acceptor_id THEN
    RAISE EXCEPTION 'Acceptor mismatch: expected %, got %', v_swap.target_id, p_acceptor_id;
  END IF;

  DELETE FROM public.duty_rosters
  WHERE member_id = v_swap.requester_id
    AND day_of_week = v_swap.original_day
    AND period = v_swap.original_period;

  INSERT INTO public.duty_rosters (member_id, day_of_week, period)
  VALUES (v_swap.target_id, v_swap.original_day, v_swap.original_period);

  UPDATE public.duty_swaps
  SET status = 'approved'
  WHERE id = p_swap_id;

  RAISE LOG 'accept_duty_swap approved by % for swap % -> target %', v_actor_id, p_swap_id, p_acceptor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.accept_duty_swap(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_duty_swap(uuid, uuid) TO authenticated;
