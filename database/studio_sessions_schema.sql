-- ==========================================================
-- 自习会话表（独立于值班签到系统）
-- ==========================================================
-- 【学习注释：studio_sessions 和 duty_logs 故意分表】
-- 值班考勤有定位和排班语义，自习会话只有在场语义，把两条业务线混在一张表里会让规则失真。

CREATE TABLE IF NOT EXISTS public.studio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,           -- NULL = 仍在自习中
  is_active boolean DEFAULT true  -- 方便快速查询
);

-- 启用行级安全策略
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

-- ==========================================================
-- 自习会话过期清理接口
-- ==========================================================
-- 由数据库统一判断“自习开始所在大节结束 10 分钟后自动结束”，
-- 前端只负责触发清理和读取最新活跃列表，避免在读列表时逐条写表。
-- 【学习注释：这类基于统一时区和课表窗口的过期规则更适合放在 RPC】
-- 这样页面刷新、后台轮询和不同客户端都能复用同一份判断逻辑。
CREATE OR REPLACE FUNCTION public.expire_studio_sessions(
  p_now timestamptz DEFAULT now()
)
RETURNS integer AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_now_date date := (p_now AT TIME ZONE 'Asia/Shanghai')::date;
  v_now_minutes integer := EXTRACT(HOUR FROM (p_now AT TIME ZONE 'Asia/Shanghai'))::integer * 60
    + EXTRACT(MINUTE FROM (p_now AT TIME ZONE 'Asia/Shanghai'))::integer;
  v_expired_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required';
  END IF;

  WITH active_sessions AS (
    SELECT
      s.id,
      (s.started_at AT TIME ZONE 'Asia/Shanghai')::date AS started_date,
      (
        EXTRACT(HOUR FROM (s.started_at AT TIME ZONE 'Asia/Shanghai'))::integer * 60
        + EXTRACT(MINUTE FROM (s.started_at AT TIME ZONE 'Asia/Shanghai'))::integer
      ) AS started_minutes
    FROM public.studio_sessions s
    WHERE s.is_active = true
  ),
  expiration_rules AS (
    SELECT
      id,
      started_date,
      CASE
        WHEN started_minutes BETWEEN 450 AND 575 THEN 585
        WHEN started_minutes BETWEEN 575 AND 700 THEN 710
        WHEN started_minutes BETWEEN 780 AND 905 THEN 915
        WHEN started_minutes BETWEEN 905 AND 1030 THEN 1040
        ELSE NULL
      END AS expire_after_minutes
    FROM active_sessions
  )
  UPDATE public.studio_sessions s
  SET
    is_active = false,
    ended_at = COALESCE(s.ended_at, p_now)
  FROM expiration_rules r
  WHERE s.id = r.id
    AND r.expire_after_minutes IS NOT NULL
    AND (
      r.started_date < v_now_date
      OR (
        r.started_date = v_now_date
        AND v_now_minutes > r.expire_after_minutes
      )
    );

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.expire_studio_sessions(timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.expire_studio_sessions(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.expire_studio_sessions(timestamptz) TO authenticated;
