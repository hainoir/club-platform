-- ==========================================================
-- 更新 duty_swaps 状态约束 + 修改 RPC 函数
-- ==========================================================
-- 提示：请在 Supabase SQL Editor 中执行此脚本

-- 1. 移除旧的 status 约束，新增包含 'accepted' 的约束
ALTER TABLE public.duty_swaps DROP CONSTRAINT IF EXISTS duty_swaps_status_check;
ALTER TABLE public.duty_swaps ADD CONSTRAINT duty_swaps_status_check
  CHECK (status IN ('pending', 'accepted', 'approved', 'rejected'));

-- 2. 替换 RPC 函数：仅处理 accepted 状态的请求（管理员审批）
CREATE OR REPLACE FUNCTION public.accept_duty_swap(
  p_swap_id uuid,
  p_acceptor_id uuid
)
RETURNS void AS $$
DECLARE
  v_swap RECORD;
BEGIN
  -- 1. 获取并锁定该 swap 请求（必须是 accepted 状态，即已有人应答）
  SELECT * INTO v_swap
  FROM public.duty_swaps
  WHERE id = p_swap_id AND status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '该代班请求不存在或状态不正确（需要已有人应答）';
  END IF;

  -- 2. 删除原排班记录
  DELETE FROM public.duty_rosters
  WHERE member_id = v_swap.requester_id
    AND day_of_week = v_swap.original_day
    AND period = v_swap.original_period;

  -- 3. 插入新排班记录（代班人 = target_id，即应答者）
  INSERT INTO public.duty_rosters (member_id, day_of_week, period)
  VALUES (v_swap.target_id, v_swap.original_day, v_swap.original_period);

  -- 4. 更新 swap 状态为已批准
  UPDATE public.duty_swaps
  SET status = 'approved'
  WHERE id = p_swap_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
