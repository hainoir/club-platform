-- ==========================================================
-- 值班模块数据结构与行级安全策略文件
-- ==========================================================

-- 1. 创建表

-- 1.1 排班池表（常规周排班）
CREATE TABLE IF NOT EXISTS public.duty_rosters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int2 NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period int2 NOT NULL CHECK (period BETWEEN 1 AND 4),
  created_at timestamptz DEFAULT now(),
  -- 约束：同一个人在同一天同一节只能有一条排班记录
  UNIQUE(day_of_week, period, member_id)
);

-- 1.2 签到流水表（值班打卡记录）
CREATE TABLE IF NOT EXISTS public.duty_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  sign_in_time timestamptz DEFAULT now(),
  location_verified boolean DEFAULT false,
  device_info text,
  week_number int4
);

-- 1.3 换班申请表（换班与代班请求）
CREATE TABLE IF NOT EXISTS public.duty_swaps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  original_day int2 NOT NULL CHECK (original_day BETWEEN 1 AND 5),
  original_period int2 NOT NULL CHECK (original_period BETWEEN 1 AND 4),
  target_day int2 CHECK (target_day BETWEEN 1 AND 5),
  target_period int2 CHECK (target_period BETWEEN 1 AND 4),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- ==========================================================
-- 2. 启用行级安全策略
-- ==========================================================
ALTER TABLE public.duty_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_swaps ENABLE ROW LEVEL SECURITY;

-- ==========================================================
-- 3. 行级安全策略配置
-- ==========================================================

-- ----------------------------------------------------
-- 表：排班池表
-- ----------------------------------------------------
-- 允许所有认证用户自由查看排班情况
DROP POLICY IF EXISTS "允许认证用户查看值班表" ON public.duty_rosters;
CREATE POLICY "允许认证用户查看值班表"
ON public.duty_rosters FOR SELECT
TO authenticated
USING (true);

-- 允许自己报名或管理员排班
DROP POLICY IF EXISTS "允许自己报名或管理员排班" ON public.duty_rosters;
CREATE POLICY "允许自己报名或管理员排班"
ON public.duty_rosters FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

-- 允许自己取消或管理员删除排班
DROP POLICY IF EXISTS "允许自己取消或管理员删除排班" ON public.duty_rosters;
CREATE POLICY "允许自己取消或管理员删除排班"
ON public.duty_rosters FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

-- ----------------------------------------------------
-- 表：签到流水表
-- ----------------------------------------------------
-- 允许大家查看他人的打卡记录 (用于透明度和看板)
DROP POLICY IF EXISTS "允许认证用户查看打卡记录" ON public.duty_logs;
CREATE POLICY "允许认证用户查看打卡记录"
ON public.duty_logs FOR SELECT
TO authenticated
USING (true);

-- 允许自己提交打卡操作
DROP POLICY IF EXISTS "允许自己提交打卡" ON public.duty_logs;
CREATE POLICY "允许自己提交打卡"
ON public.duty_logs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

-- 仅允许管理员修改打卡记录 (例如补签或标记无效)
DROP POLICY IF EXISTS "仅允许管理员修改打卡记录" ON public.duty_logs;
CREATE POLICY "仅允许管理员修改打卡记录"
ON public.duty_logs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

-- 仅允许管理员删除打卡流水记录 
DROP POLICY IF EXISTS "仅允许管理员删除打卡记录" ON public.duty_logs;
CREATE POLICY "仅允许管理员删除打卡记录"
ON public.duty_logs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

-- ----------------------------------------------------
-- 表：换班申请表
-- ----------------------------------------------------
-- 允许查看大厅里的所有换班请求
DROP POLICY IF EXISTS "允许认证用户查看换班请求" ON public.duty_swaps;
CREATE POLICY "允许认证用户查看换班请求"
ON public.duty_swaps FOR SELECT
TO authenticated
USING (true);

-- 允许发起换班 (请求人必须是自己)
DROP POLICY IF EXISTS "允许发起换班申请" ON public.duty_swaps;
CREATE POLICY "允许发起换班申请"
ON public.duty_swaps FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = requester_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
);

-- 允许更新换班状态 
DROP POLICY IF EXISTS "允许相关方修改换班状态" ON public.duty_swaps;
CREATE POLICY "允许相关方修改换班状态"
ON public.duty_swaps FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id IN (requester_id, target_id) AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id IN (requester_id, target_id) AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);

-- 允许撤回(删除)自己发起的换班，或管理员直接清理
DROP POLICY IF EXISTS "允许自己撤回或管理员删除换班请求" ON public.duty_swaps;
CREATE POLICY "允许自己撤回或管理员删除换班请求"
ON public.duty_swaps FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = requester_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
);
