-- ==========================================================
-- Duty swap RPCs
-- Canonical source of truth for:
--   - public.accept_duty_swap
--   - public.volunteer_for_duty_swap
--   - public.return_duty_swap_to_hall
-- ==========================================================

ALTER TABLE public.duty_swaps DROP CONSTRAINT IF EXISTS duty_swaps_status_check;
ALTER TABLE public.duty_swaps ADD CONSTRAINT duty_swaps_status_check
  CHECK (status IN ('pending', 'accepted', 'approved', 'rejected'));

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
        OR trim(admin.role) IN (
          U&'\7BA1\7406\5458',
          U&'\4E3B\5E2D',
          U&'\6267\884C\4E3B\5E2D',
          U&'\526F\4E3B\5E2D',
          U&'\90E8\957F'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden: only admins can approve swap requests';
  END IF;

  SELECT *
  INTO v_swap
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

  IF v_swap.leave_id IS NOT NULL THEN
    UPDATE public.duty_leaves
    SET status = 'approved'
    WHERE id = v_swap.leave_id;
  END IF;

  RAISE LOG 'accept_duty_swap approved by % for swap % -> target %', v_actor_id, p_swap_id, p_acceptor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.accept_duty_swap(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_duty_swap(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.volunteer_for_duty_swap(
  p_swap_id uuid
)
RETURNS void AS $$
DECLARE
  v_swap public.duty_swaps%ROWTYPE;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required';
  END IF;

  SELECT *
  INTO v_swap
  FROM public.duty_swaps
  WHERE id = p_swap_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap request not found or no longer pending';
  END IF;

  IF v_swap.requester_id = v_actor_id THEN
    RAISE EXCEPTION 'Forbidden: requester cannot volunteer for own swap';
  END IF;

  IF v_swap.target_id IS NOT NULL AND v_swap.target_id <> v_actor_id THEN
    RAISE EXCEPTION 'Forbidden: swap request is reserved for another member';
  END IF;

  UPDATE public.duty_swaps
  SET target_id = v_actor_id,
      status = 'accepted'
  WHERE id = p_swap_id;

  RAISE LOG 'volunteer_for_duty_swap accepted by % for swap %', v_actor_id, p_swap_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.volunteer_for_duty_swap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.volunteer_for_duty_swap(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.return_duty_swap_to_hall(
  p_swap_id uuid
)
RETURNS void AS $$
DECLARE
  v_swap public.duty_swaps%ROWTYPE;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required';
  END IF;

  SELECT *
  INTO v_swap
  FROM public.duty_swaps
  WHERE id = p_swap_id
    AND status IN ('pending', 'accepted')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Swap request not found or cannot be returned';
  END IF;

  IF v_swap.target_id IS NULL AND v_swap.status = 'pending' THEN
    RAISE EXCEPTION 'Swap request is already public';
  END IF;

  IF NOT (
    v_swap.requester_id = v_actor_id
    OR v_swap.target_id = v_actor_id
    OR EXISTS (
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
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden: only requester, target, or admin can return the swap';
  END IF;

  UPDATE public.duty_swaps
  SET target_id = NULL,
      status = 'pending'
  WHERE id = p_swap_id;

  RAISE LOG 'return_duty_swap_to_hall by % for swap %', v_actor_id, p_swap_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.return_duty_swap_to_hall(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_duty_swap_to_hall(uuid) TO authenticated;
