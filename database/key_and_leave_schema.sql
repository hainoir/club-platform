-- ==========================================================
-- 钥匙管理 + 请假补班 + 钥匙交接数据结构
-- ==========================================================
-- 提示：请在数据库控制台的查询编辑器中执行此脚本

-- 1. 排班池表新增“是否持钥匙”字段
ALTER TABLE public.duty_rosters
ADD COLUMN IF NOT EXISTS has_key boolean DEFAULT false;

COMMENT ON COLUMN public.duty_rosters.has_key IS '该排班人员是否持有钥匙';

-- 2. 请假记录表
CREATE TABLE IF NOT EXISTS public.duty_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int2 NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period int2 NOT NULL CHECK (period BETWEEN 1 AND 4),
  reason text,
  penalty_shifts int2 NOT NULL DEFAULT 1 CHECK (penalty_shifts BETWEEN 1 AND 2),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at timestamptz DEFAULT now()
);

-- 历史兼容：旧版请假默认提交即生效，这里统一回填为 approved
UPDATE public.duty_leaves
SET status = 'approved'
WHERE status = 'pending';

-- 请假与代班请求关联，便于审批通过时同步生效
ALTER TABLE public.duty_swaps
ADD COLUMN IF NOT EXISTS leave_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'duty_swaps_leave_id_fkey'
      AND conrelid = 'public.duty_swaps'::regclass
  ) THEN
    ALTER TABLE public.duty_swaps
    ADD CONSTRAINT duty_swaps_leave_id_fkey
    FOREIGN KEY (leave_id) REFERENCES public.duty_leaves(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- 3. 补班安排表 (请假时选择的本周剩余或下周补值班节次)
CREATE TABLE IF NOT EXISTS public.duty_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id uuid NOT NULL REFERENCES public.duty_leaves(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  compensation_date date NOT NULL,
  day_of_week int2 NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period int2 NOT NULL CHECK (period BETWEEN 1 AND 4),
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 兼容旧环境：补班记录新增具体日期字段
ALTER TABLE public.duty_compensations
ADD COLUMN IF NOT EXISTS compensation_date date;

COMMENT ON COLUMN public.duty_compensations.compensation_date IS '补班对应的具体日期（值班时区）';

-- 历史数据回填：旧版请假流程只允许选择“下周补班”，因此这里按旧规则推导具体日期
WITH legacy_compensation_dates AS (
  SELECT
    c.id,
    (
      (
        CASE
          WHEN candidate.candidate_leave_date < localized.leave_local_date
            OR (
              candidate.candidate_leave_date = localized.leave_local_date
              AND localized.leave_local_minutes > period_end.leave_period_end_minutes
            )
            THEN candidate.candidate_leave_date + 7
          ELSE candidate.candidate_leave_date
        END
      ) - (l.day_of_week - 1) + 7 + (c.day_of_week - 1)
    )::date AS compensation_date
  FROM public.duty_compensations c
  JOIN public.duty_leaves l ON l.id = c.leave_id
  CROSS JOIN LATERAL (
    SELECT
      timezone('Asia/Shanghai', l.created_at)::date AS leave_local_date,
      (
        EXTRACT(HOUR FROM timezone('Asia/Shanghai', l.created_at))::int * 60 +
        EXTRACT(MINUTE FROM timezone('Asia/Shanghai', l.created_at))::int
      ) AS leave_local_minutes
  ) localized
  CROSS JOIN LATERAL (
    SELECT (
      localized.leave_local_date
      - (EXTRACT(ISODOW FROM localized.leave_local_date)::int - 1)
      + (l.day_of_week - 1)
    )::date AS candidate_leave_date
  ) candidate
  CROSS JOIN LATERAL (
    SELECT CASE l.period
      WHEN 1 THEN 9 * 60 + 35
      WHEN 2 THEN 11 * 60 + 40
      WHEN 3 THEN 15 * 60 + 5
      WHEN 4 THEN 17 * 60 + 10
      ELSE 24 * 60
    END AS leave_period_end_minutes
  ) period_end
  WHERE c.compensation_date IS NULL
)
UPDATE public.duty_compensations c
SET compensation_date = legacy.compensation_date
FROM legacy_compensation_dates legacy
WHERE c.id = legacy.id;

ALTER TABLE public.duty_compensations
ALTER COLUMN compensation_date SET NOT NULL;

-- 4. 钥匙交接记录表
CREATE TABLE IF NOT EXISTS public.key_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  to_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz
);

-- ==========================================================
-- 5. 启用行级安全策略
-- ==========================================================
ALTER TABLE public.duty_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_compensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_transfers ENABLE ROW LEVEL SECURITY;

-- ==========================================================
-- 6. 行级安全策略
-- ==========================================================

-- 请假记录：所有认证用户可查看，本人可插入，管理员可修改
DROP POLICY IF EXISTS "允许认证用户查看请假" ON public.duty_leaves;
CREATE POLICY "允许认证用户查看请假"
ON public.duty_leaves FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "允许本人提交请假" ON public.duty_leaves;
CREATE POLICY "允许本人提交请假"
ON public.duty_leaves FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
);

DROP POLICY IF EXISTS "允许管理员或本人操作请假" ON public.duty_leaves;
CREATE POLICY "允许管理员或本人操作请假"
ON public.duty_leaves FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
  OR EXISTS (
    SELECT 1 FROM public.members admin WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

DROP POLICY IF EXISTS "允许管理员或本人删除请假" ON public.duty_leaves;
CREATE POLICY "允许管理员或本人删除请假"
ON public.duty_leaves FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
  OR EXISTS (
    SELECT 1 FROM public.members admin WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

-- 补班安排：所有认证用户可查看，本人可插入
DROP POLICY IF EXISTS "允许认证用户查看补班" ON public.duty_compensations;
CREATE POLICY "允许认证用户查看补班"
ON public.duty_compensations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "允许本人提交补班" ON public.duty_compensations;
CREATE POLICY "允许本人提交补班"
ON public.duty_compensations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
);

-- 钥匙交接：所有认证用户可查看，本人可发起，相关方可更新
DROP POLICY IF EXISTS "允许认证用户查看钥匙交接" ON public.key_transfers;
CREATE POLICY "允许认证用户查看钥匙交接"
ON public.key_transfers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "允许本人发起钥匙交接" ON public.key_transfers;
CREATE POLICY "允许本人发起钥匙交接"
ON public.key_transfers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = from_member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
);

DROP POLICY IF EXISTS "允许相关方更新钥匙交接" ON public.key_transfers;
CREATE POLICY "允许相关方更新钥匙交接"
ON public.key_transfers FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id IN (from_member_id, to_member_id) AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

-- 排班池表新增更新策略
DROP POLICY IF EXISTS "允许管理员修改排班" ON public.duty_rosters;
CREATE POLICY "允许管理员修改排班"
ON public.duty_rosters FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members admin WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

-- 远程过程函数：确认钥匙交接（接收人确认后，更新排班中的钥匙持有状态）
CREATE OR REPLACE FUNCTION public.confirm_key_transfer(p_transfer_id uuid, p_confirmer_id uuid)
RETURNS void AS $$
DECLARE
  v_transfer public.key_transfers%ROWTYPE;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required';
  END IF;

  IF v_actor_id <> p_confirmer_id THEN
    RAISE EXCEPTION 'Forbidden: confirmer must match current user';
  END IF;

  SELECT * INTO v_transfer
  FROM public.key_transfers
  WHERE id = p_transfer_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Key transfer not found or already confirmed';
  END IF;

  IF v_transfer.to_member_id <> v_actor_id THEN
    RAISE EXCEPTION 'Forbidden: only transfer receiver can confirm';
  END IF;

  UPDATE public.key_transfers
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_transfer_id;

  UPDATE public.duty_rosters
  SET has_key = false
  WHERE member_id = v_transfer.from_member_id;

  UPDATE public.duty_rosters
  SET has_key = true
  WHERE member_id = v_transfer.to_member_id;

  RAISE LOG 'confirm_key_transfer by % for transfer %', v_actor_id, p_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.confirm_key_transfer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_key_transfer(uuid, uuid) TO authenticated;

-- ==========================================================
-- 7. 请假可见性规则及审批远程过程函数
-- ==========================================================

DROP POLICY IF EXISTS duty_leaves_select_visible_v2 ON public.duty_leaves;
DROP POLICY IF EXISTS "允许认证用户查看请假" ON public.duty_leaves;
CREATE POLICY duty_leaves_select_visible_v2
ON public.duty_leaves FOR SELECT TO authenticated
USING (
  status = 'approved'
  OR EXISTS (
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
        OR trim(admin.role) IN (
          U&'\7BA1\7406\5458',
          U&'\4E3B\5E2D',
          U&'\6267\884C\4E3B\5E2D',
          U&'\526F\4E3B\5E2D',
          U&'\90E8\957F'
        )
      )
  )
);

DROP POLICY IF EXISTS duty_compensations_select_visible_v2 ON public.duty_compensations;
DROP POLICY IF EXISTS "允许认证用户查看补班" ON public.duty_compensations;
CREATE POLICY duty_compensations_select_visible_v2
ON public.duty_compensations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.duty_leaves l
    WHERE l.id = leave_id
      AND (
        l.status = 'approved'
        OR EXISTS (
          SELECT 1
          FROM public.members m
          WHERE m.id = l.member_id
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
              OR trim(admin.role) IN (
                U&'\7BA1\7406\5458',
                U&'\4E3B\5E2D',
                U&'\6267\884C\4E3B\5E2D',
                U&'\526F\4E3B\5E2D',
                U&'\90E8\957F'
              )
            )
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.approve_duty_leave(
  p_leave_id uuid
)
RETURNS void AS $$
DECLARE
  v_leave public.duty_leaves%ROWTYPE;
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
        OR trim(admin.role) IN (
          U&'\7BA1\7406\5458',
          U&'\4E3B\5E2D',
          U&'\6267\884C\4E3B\5E2D',
          U&'\526F\4E3B\5E2D',
          U&'\90E8\957F'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden: only admins can approve leave requests';
  END IF;

  SELECT *
  INTO v_leave
  FROM public.duty_leaves
  WHERE id = p_leave_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request not found or already approved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.duty_swaps
    WHERE leave_id = v_leave.id
  ) THEN
    RAISE EXCEPTION 'Leave request must be approved through the linked swap workflow';
  END IF;

  UPDATE public.duty_leaves
  SET status = 'approved'
  WHERE id = v_leave.id;

  RAISE LOG 'approve_duty_leave approved by % for leave %', v_actor_id, p_leave_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.approve_duty_leave(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_duty_leave(uuid) TO authenticated;
