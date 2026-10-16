-- submit_duty_sign_in decides the shift at duty_sign_in_instant(), then inserted
-- duty_logs without sign_in_time. The column default calls now() again, so the
-- stored Shanghai date can be a different day from the day the window and the
-- one-per-day check used. Store that same instant.
--
-- A PostgREST session still gets now() from duty_sign_in_instant(). The
-- superuser-only duty.sign_in_at setting is unchanged and is still ignored for
-- authenticator.

CREATE OR REPLACE FUNCTION public.submit_duty_sign_in(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_device_info text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id uuid;
  v_at timestamptz := public.duty_sign_in_instant();
  v_today date := timezone('Asia/Shanghai', v_at)::date;
  v_hint text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required'
      USING HINT = 'unauthorized';
  END IF;

  SELECT m.id
  INTO v_member_id
  FROM public.members m
  WHERE m.id = auth.uid()
     OR lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  ORDER BY (m.id = auth.uid()) DESC
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION '未找到当前成员档案，请联系管理员。'
      USING HINT = 'member_not_found';
  END IF;

  v_hint := public.evaluate_duty_sign_in_window(v_member_id, v_at, false);
  IF v_hint = 'holiday' THEN
    RAISE EXCEPTION '今日为公共假日，不记录值班签到。'
      USING HINT = 'holiday';
  ELSIF v_hint = 'not_rostered' THEN
    RAISE EXCEPTION '当前节次没有你的排班，不能签到。'
      USING HINT = 'not_rostered';
  ELSIF v_hint IS NOT NULL THEN
    RAISE EXCEPTION '当前不在值班签到时段。'
      USING HINT = 'outside_shift_window';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.duty_logs
    WHERE member_id = v_member_id
      AND COALESCE(sign_in_date, timezone('Asia/Shanghai', sign_in_time)::date) = v_today
  ) THEN
    RETURN 'already_signed_in';
  END IF;

  INSERT INTO public.duty_logs (
    member_id,
    sign_in_time,
    latitude,
    longitude,
    accuracy_meters,
    device_info
  )
  VALUES (
    v_member_id,
    v_at,
    p_latitude,
    p_longitude,
    p_accuracy,
    NULLIF(btrim(p_device_info), '')
  );

  RETURN 'signed_in';
EXCEPTION
  WHEN unique_violation THEN
    RETURN 'already_signed_in';
END;
$$;
