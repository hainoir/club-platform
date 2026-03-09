-- ==========================================================
-- 钥匙管理 + 请假补班 + 钥匙交接 数据库 Schema
-- ==========================================================
-- 提示：请在 Supabase SQL Editor 中执行此脚本

-- 1. duty_rosters 新增 has_key 字段
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

-- 3. 补班安排表（请假时选择的下周补值班节次）
CREATE TABLE IF NOT EXISTS public.duty_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id uuid NOT NULL REFERENCES public.duty_leaves(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int2 NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period int2 NOT NULL CHECK (period BETWEEN 1 AND 4),
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 4. 钥匙交接记录表
CREATE TABLE IF NOT EXISTS public.key_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  to_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz DEFAULT now()
);

-- ==========================================================
-- 5. 启用行级安全 (RLS)
-- ==========================================================
ALTER TABLE public.duty_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_compensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_transfers ENABLE ROW LEVEL SECURITY;

-- ==========================================================
-- 6. RLS 策略
-- ==========================================================

-- duty_leaves: 所有认证用户可查看，本人可插入，管理员可修改
DROP POLICY IF EXISTS "允许认证用户查看请假" ON public.duty_leaves;
CREATE POLICY "允许认证用户查看请假"
ON public.duty_leaves FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "允许本人提交请假" ON public.duty_leaves;
CREATE POLICY "允许本人提交请假"
ON public.duty_leaves FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
);

DROP POLICY IF EXISTS "允许管理员或本人操作请假" ON public.duty_leaves;
CREATE POLICY "允许管理员或本人操作请假"
ON public.duty_leaves FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
  OR EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

DROP POLICY IF EXISTS "允许管理员或本人删除请假" ON public.duty_leaves;
CREATE POLICY "允许管理员或本人删除请假"
ON public.duty_leaves FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
  OR EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

-- duty_compensations: 与 duty_leaves 一致
DROP POLICY IF EXISTS "允许认证用户查看补班" ON public.duty_compensations;
CREATE POLICY "允许认证用户查看补班"
ON public.duty_compensations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "允许本人提交补班" ON public.duty_compensations;
CREATE POLICY "允许本人提交补班"
ON public.duty_compensations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
);

-- key_transfers: 所有认证用户可查看，相关方可插入/修改
DROP POLICY IF EXISTS "允许认证用户查看钥匙交接" ON public.key_transfers;
CREATE POLICY "允许认证用户查看钥匙交接"
ON public.key_transfers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "允许本人发起钥匙交接" ON public.key_transfers;
CREATE POLICY "允许本人发起钥匙交接"
ON public.key_transfers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = from_member_id AND m.email = auth.jwt()->>'email')
);

DROP POLICY IF EXISTS "允许相关方更新钥匙交接" ON public.key_transfers;
CREATE POLICY "允许相关方更新钥匙交接"
ON public.key_transfers FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id IN (from_member_id, to_member_id) AND m.email = auth.jwt()->>'email'
  )
);

-- duty_rosters 新增 UPDATE 策略（用于管理员切换 has_key）
DROP POLICY IF EXISTS "允许管理员修改排班" ON public.duty_rosters;
CREATE POLICY "允许管理员修改排班"
ON public.duty_rosters FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

-- RPC: 确认钥匙交接（接收人确认后，更新排班中的钥匙持有状态）
CREATE OR REPLACE FUNCTION public.confirm_key_transfer(p_transfer_id uuid, p_confirmer_id uuid)
RETURNS void AS $$
DECLARE
  v_transfer RECORD;
BEGIN
  SELECT * INTO v_transfer
  FROM public.key_transfers
  WHERE id = p_transfer_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '该交接记录不存在或已确认';
  END IF;

  IF v_transfer.to_member_id != p_confirmer_id THEN
    RAISE EXCEPTION '只有接收人才能确认交接';
  END IF;

  -- 更新交接状态
  UPDATE public.key_transfers SET status = 'confirmed' WHERE id = p_transfer_id;

  -- 移除交出者的所有钥匙标记
  UPDATE public.duty_rosters SET has_key = false WHERE member_id = v_transfer.from_member_id AND has_key = true;

  -- 标记接收者为钥匙持有人（如果接收者有排班的话，只标记一条）
  UPDATE public.duty_rosters SET has_key = true
  WHERE id = (
    SELECT id FROM public.duty_rosters WHERE member_id = v_transfer.to_member_id LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
