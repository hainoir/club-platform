-- ==========================================================
-- RPC 函数：处理代班操作（绕过 RLS 的 SECURITY DEFINER 权限）
-- ==========================================================
-- 提示：请在 Supabase SQL Editor 中执行此脚本

CREATE OR REPLACE FUNCTION public.accept_duty_swap(
  p_swap_id uuid,
  p_acceptor_id uuid
)
RETURNS void AS $$
DECLARE
  v_swap RECORD;
BEGIN
  -- 1. 获取并锁定该 swap 请求
  SELECT * INTO v_swap
  FROM public.duty_swaps
  WHERE id = p_swap_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '该代班请求不存在或已被处理';
  END IF;

  -- 2. 防止自己接受自己的请求
  IF v_swap.requester_id = p_acceptor_id THEN
    RAISE EXCEPTION '不能接受自己发起的代班请求';
  END IF;

  -- 3. 删除原排班记录
  DELETE FROM public.duty_rosters
  WHERE member_id = v_swap.requester_id
    AND day_of_week = v_swap.original_day
    AND period = v_swap.original_period;

  -- 4. 插入新排班记录（代班人）
  INSERT INTO public.duty_rosters (member_id, day_of_week, period)
  VALUES (p_acceptor_id, v_swap.original_day, v_swap.original_period);

  -- 5. 更新 swap 状态为已完成
  UPDATE public.duty_swaps
  SET status = 'approved', target_id = p_acceptor_id
  WHERE id = p_swap_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
