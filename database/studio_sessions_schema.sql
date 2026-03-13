-- ==========================================================
-- 自习会话表（独立于值班签到系统）
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.studio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,           -- NULL = 仍在自习中
  is_active boolean DEFAULT true  -- 方便快速查询
);

-- 启用 RLS
ALTER TABLE public.studio_sessions ENABLE ROW LEVEL SECURITY;

-- 所有认证用户可查看
DROP POLICY IF EXISTS "允许认证用户查看自习" ON public.studio_sessions;
CREATE POLICY "允许认证用户查看自习"
ON public.studio_sessions FOR SELECT TO authenticated USING (true);

-- 本人可插入
DROP POLICY IF EXISTS "允许本人开始自习" ON public.studio_sessions;
CREATE POLICY "允许本人开始自习"
ON public.studio_sessions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
);

-- 本人可更新（结束自习）
DROP POLICY IF EXISTS "允许本人结束自习" ON public.studio_sessions;
CREATE POLICY "允许本人结束自习"
ON public.studio_sessions FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
);

-- 管理员可删除
DROP POLICY IF EXISTS "允许管理员删除自习记录" ON public.studio_sessions;
CREATE POLICY "允许管理员删除自习记录"
ON public.studio_sessions FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', '管理员', '主席', '执行主席', '副主席', '部长')
  )
);
