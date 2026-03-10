-- ==========================================================
-- duty_swaps status constraint + secure RPC
-- canonical source for accept_duty_swap behavior
-- ==========================================================

-- 1) Ensure duty_swaps status supports accepted workflow
ALTER TABLE public.duty_swaps DROP CONSTRAINT IF EXISTS duty_swaps_status_check;
ALTER TABLE public.duty_swaps ADD CONSTRAINT duty_swaps_status_check
  CHECK (status IN ('pending', 'accepted', 'approved', 'rejected'));

-- 2) Secure RPC: only admins can approve accepted swap requests
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
    WHERE admin.id = v_actor_id
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
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
