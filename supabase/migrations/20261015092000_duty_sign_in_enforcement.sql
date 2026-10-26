-- ==========================================================
-- 值班签到：节次窗口、列锁、补签审计、围栏只读
-- ==========================================================
-- 在 database/duty_signin_geofence.sql（或同文的
-- supabase/migrations/20261015083723_duty_signin_geofence.sql）之后执行。
-- 重复执行是安全的。不要在已经手工建表的生产库上重放更早的基线迁移。
--
-- 节次窗口与 lib/duty/duty-time.ts 的 getDutyPeriodByMinutes、
-- isDutyRequiredDate 一致；假日日期与 lib/duty/china-public-holidays.ts 一致。
-- 这个窗口比首页按钮用的上课时间略宽（含课前和课间），这样能计入考勤的
-- 时刻才允许写入，节次外的调用不会再占掉当天唯一名额。

CREATE OR REPLACE FUNCTION public.is_china_public_holiday(p_date date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_date = ANY (ARRAY[
    DATE '2026-01-01',
    DATE '2026-01-02',
    DATE '2026-01-03',
    DATE '2026-02-15',
    DATE '2026-02-16',
    DATE '2026-02-17',
    DATE '2026-02-18',
    DATE '2026-02-19',
    DATE '2026-02-20',
    DATE '2026-02-21',
    DATE '2026-02-22',
    DATE '2026-02-23',
    DATE '2026-04-04',
    DATE '2026-04-05',
    DATE '2026-04-06',
    DATE '2026-05-01',
    DATE '2026-05-02',
    DATE '2026-05-03',
    DATE '2026-05-04',
    DATE '2026-05-05',
    DATE '2026-06-19',
    DATE '2026-06-20',
    DATE '2026-06-21',
    DATE '2026-09-25',
    DATE '2026-09-26',
    DATE '2026-09-27',
    DATE '2026-10-01',
    DATE '2026-10-02',
    DATE '2026-10-03',
    DATE '2026-10-04',
    DATE '2026-10-05',
    DATE '2026-10-06',
    DATE '2026-10-07'
  ]::date[]);
$$;

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id
  FROM public.members m
  WHERE m.id = auth.uid()
     OR lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  ORDER BY CASE WHEN m.id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_current_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE (m.id = auth.uid() OR lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
      AND (
        lower(trim(m.role)) = 'admin'
        OR trim(m.role) IN ('管理员', '主席', '执行主席', '副主席', '部长')
      )
  );
$$;

-- 只有数据库超级用户会话（本地 PGlite / postgres）可以钉住签到时钟。
-- PostgREST 的 session_user 是 authenticator，读不到这个设置。
CREATE OR REPLACE FUNCTION public.duty_sign_in_instant()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text;
BEGIN
  IF session_user IN ('postgres', 'supabase_admin') THEN
    v_raw := nullif(current_setting('duty.sign_in_at', true), '');
    IF v_raw IS NOT NULL THEN
      RETURN v_raw::timestamptz;
    END IF;
  END IF;
  RETURN now();
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_duty_sign_in_window(
  p_member_id uuid,
  p_at timestamptz,
  p_ignore_leave boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_local timestamp;
  v_date date;
  v_dow int;
  v_minutes int;
  v_period int;
  v_period_end int;
BEGIN
  v_local := timezone('Asia/Shanghai', p_at);
  v_date := v_local::date;
  v_dow := extract(isodow FROM v_date)::int;
  v_minutes := extract(hour FROM v_local)::int * 60 + extract(minute FROM v_local)::int;

  IF public.is_china_public_holiday(v_date) THEN
    RETURN 'holiday';
  END IF;

  IF v_dow < 1 OR v_dow > 5 THEN
    RETURN 'outside_shift_window';
  END IF;

  -- 与 getDutyPeriodByMinutes 相同：先命中的区间生效，边界分钟归上一节。
  IF v_minutes >= 7 * 60 + 30 AND v_minutes <= 9 * 60 + 35 THEN
    v_period := 1;
  ELSIF v_minutes >= 9 * 60 + 35 AND v_minutes <= 11 * 60 + 40 THEN
    v_period := 2;
  ELSIF v_minutes >= 13 * 60 AND v_minutes <= 15 * 60 + 5 THEN
    v_period := 3;
  ELSIF v_minutes >= 15 * 60 + 5 AND v_minutes <= 17 * 60 + 10 THEN
    v_period := 4;
  ELSE
    v_period := 0;
  END IF;

  IF v_period = 0 THEN
    RETURN 'outside_shift_window';
  END IF;

  v_period_end := CASE v_period
    WHEN 1 THEN 9 * 60 + 35
    WHEN 2 THEN 11 * 60 + 40
    WHEN 3 THEN 15 * 60 + 5
    ELSE 17 * 60 + 10
  END;

  IF NOT p_ignore_leave AND EXISTS (
    SELECT 1
    FROM public.duty_leaves leave
    WHERE leave.member_id = p_member_id
      AND leave.day_of_week = v_dow
      AND leave.period = v_period
      AND leave.leave_date = v_date
      AND (leave.status IS NULL OR leave.status = 'approved')
      AND leave.expires_at > p_at
      AND v_minutes < v_period_end
  ) THEN
    RETURN 'not_rostered';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.duty_rosters roster
    WHERE roster.member_id = p_member_id
      AND roster.day_of_week = v_dow
      AND roster.period = v_period
  ) THEN
    RETURN 'not_rostered';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_duty_sign_in_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latitude double precision;
  v_longitude double precision;
  v_radius_meters double precision;
  v_max_accuracy_meters double precision;
  v_lat1 double precision;
  v_lat2 double precision;
  v_delta_lat double precision;
  v_delta_lon double precision;
  v_a double precision;
  v_distance_meters double precision;
BEGIN
  -- 管理员补签函数在同一事务里打开这个开关。客户端不能 INSERT，也设不了它。
  IF current_setting('duty.skip_geofence', true) = 'on' THEN
    NEW.location_verified := true;
    RETURN NEW;
  END IF;

  SELECT
    latitude,
    longitude,
    radius_meters,
    max_accuracy_meters
  INTO
    v_latitude,
    v_longitude,
    v_radius_meters,
    v_max_accuracy_meters
  FROM public.studio_geofence
  WHERE id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '工作室地理围栏尚未配置，请联系管理员。'
      USING HINT = 'geofence_unconfigured';
  END IF;

  IF NEW.latitude IS NULL
     OR NEW.longitude IS NULL
     OR NEW.latitude NOT BETWEEN -90 AND 90
     OR NEW.longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION '定位坐标无效，请稍后重试。'
      USING HINT = 'invalid_coordinates';
  END IF;

  IF NEW.accuracy_meters IS NULL OR NOT (NEW.accuracy_meters >= 0) THEN
    RAISE EXCEPTION '定位精度异常，请稍后重试。'
      USING HINT = 'invalid_accuracy';
  END IF;

  IF NEW.accuracy_meters > v_max_accuracy_meters THEN
    RAISE EXCEPTION '当前定位精度约 % 米，请移动到开阔区域后重试。', round(NEW.accuracy_meters)::bigint
      USING
        HINT = 'insufficient_accuracy',
        DETAIL = NEW.accuracy_meters::text;
  END IF;

  v_lat1 := radians(NEW.latitude);
  v_lat2 := radians(v_latitude);
  v_delta_lat := v_lat2 - v_lat1;
  v_delta_lon := radians(NEW.longitude - v_longitude);
  v_a := power(sin(v_delta_lat / 2), 2)
       + cos(v_lat1) * cos(v_lat2) * power(sin(v_delta_lon / 2), 2);
  v_distance_meters := 6371000 * 2 * atan2(sqrt(v_a), sqrt(greatest(0, 1 - v_a)));

  IF v_distance_meters > v_radius_meters THEN
    RAISE EXCEPTION '当前位置距离工作室约 % 米，超出允许范围。', round(v_distance_meters)::bigint
      USING
        HINT = 'out_of_range',
        DETAIL = v_distance_meters::text;
  END IF;

  NEW.location_verified := true;
  NEW.distance_meters := v_distance_meters;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_duty_sign_in_column_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('duty.sign_in_maintenance', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.sign_in_time IS DISTINCT FROM OLD.sign_in_time
     OR NEW.sign_in_date IS DISTINCT FROM OLD.sign_in_date
     OR NEW.location_verified IS DISTINCT FROM OLD.location_verified
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.accuracy_meters IS DISTINCT FROM OLD.accuracy_meters
     OR NEW.distance_meters IS DISTINCT FROM OLD.distance_meters THEN
    RAISE EXCEPTION '签到地点、核验、成员和日期不能直接修改。'
      USING HINT = 'sign_in_columns_locked';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duty_sign_in_column_update ON public.duty_logs;
CREATE TRIGGER trg_prevent_duty_sign_in_column_update
BEFORE UPDATE ON public.duty_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duty_sign_in_column_update();

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
    latitude,
    longitude,
    accuracy_meters,
    device_info
  )
  VALUES (
    v_member_id,
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

CREATE TABLE IF NOT EXISTS public.duty_sign_in_admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('backfill', 'mark_invalid')),
  actor_member_id uuid NOT NULL REFERENCES public.members(id),
  duty_log_id uuid REFERENCES public.duty_logs(id) ON DELETE SET NULL,
  target_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  sign_in_time timestamptz,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.studio_geofence_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_member_id uuid NOT NULL REFERENCES public.members(id),
  previous_latitude double precision,
  previous_longitude double precision,
  previous_radius_meters double precision,
  previous_max_accuracy_meters double precision,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters double precision NOT NULL,
  max_accuracy_meters double precision NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.duty_sign_in_admin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_geofence_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duty_sign_in_admin_events_select_admin ON public.duty_sign_in_admin_events;
CREATE POLICY duty_sign_in_admin_events_select_admin
ON public.duty_sign_in_admin_events FOR SELECT
TO authenticated
USING (public.is_current_admin());

DROP POLICY IF EXISTS studio_geofence_audits_select_admin ON public.studio_geofence_audits;
CREATE POLICY studio_geofence_audits_select_admin
ON public.studio_geofence_audits FOR SELECT
TO authenticated
USING (public.is_current_admin());

REVOKE ALL ON TABLE public.duty_sign_in_admin_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.studio_geofence_audits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.duty_sign_in_admin_events TO authenticated;
GRANT SELECT ON TABLE public.studio_geofence_audits TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_duty_admin(p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_reason text := btrim(p_reason);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required'
      USING HINT = 'unauthorized';
  END IF;

  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION '只有管理员可以执行此操作。'
      USING HINT = 'not_admin';
  END IF;

  v_actor := public.current_member_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '未找到当前成员档案，请联系管理员。'
      USING HINT = 'member_not_found';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) < 1 OR char_length(v_reason) > 200 THEN
    RAISE EXCEPTION '请填写 1 到 200 字的原因。'
      USING HINT = 'reason_required';
  END IF;

  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_duty_sign_in_invalid(
  p_log_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_verified boolean;
  v_member_id uuid;
  v_sign_in_time timestamptz;
BEGIN
  v_actor := public.assert_duty_admin(p_reason);

  SELECT location_verified, member_id, sign_in_time
  INTO v_verified, v_member_id, v_sign_in_time
  FROM public.duty_logs
  WHERE id = p_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '没有这条签到记录。'
      USING HINT = 'log_not_found';
  END IF;

  IF v_verified IS NOT TRUE THEN
    RAISE EXCEPTION '这条签到已经是无效状态。'
      USING HINT = 'already_invalid';
  END IF;

  PERFORM set_config('duty.sign_in_maintenance', 'on', true);
  UPDATE public.duty_logs
  SET location_verified = false
  WHERE id = p_log_id;

  INSERT INTO public.duty_sign_in_admin_events (
    action,
    actor_member_id,
    duty_log_id,
    target_member_id,
    sign_in_time,
    reason
  )
  VALUES (
    'mark_invalid',
    v_actor,
    p_log_id,
    v_member_id,
    v_sign_in_time,
    btrim(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_backfill_duty_sign_in(
  p_member_id uuid,
  p_sign_in_time timestamptz,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_hint text;
  v_log_id uuid;
BEGIN
  v_actor := public.assert_duty_admin(p_reason);

  IF p_member_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members WHERE id = p_member_id
  ) THEN
    RAISE EXCEPTION '未找到要补签的成员。'
      USING HINT = 'member_not_found';
  END IF;

  IF p_sign_in_time IS NULL OR p_sign_in_time > public.duty_sign_in_instant() + interval '2 minutes' THEN
    RAISE EXCEPTION '补签时间不能晚于现在。'
      USING HINT = 'future_sign_in';
  END IF;

  -- 补签仍要落在可计入考勤的节次，并要求当天有排班。已批准请假不阻挡补签。
  v_hint := public.evaluate_duty_sign_in_window(p_member_id, p_sign_in_time, true);
  IF v_hint = 'holiday' THEN
    RAISE EXCEPTION '公共假日不能补签。'
      USING HINT = 'holiday';
  ELSIF v_hint = 'not_rostered' THEN
    RAISE EXCEPTION '该成员在这一节没有排班，不能补签。'
      USING HINT = 'not_rostered';
  ELSIF v_hint IS NOT NULL THEN
    RAISE EXCEPTION '补签时间不在值班节次内。'
      USING HINT = 'outside_shift_window';
  END IF;

  PERFORM set_config('duty.skip_geofence', 'on', true);
  INSERT INTO public.duty_logs (
    member_id,
    sign_in_time,
    device_info
  )
  VALUES (
    p_member_id,
    p_sign_in_time,
    'admin_backfill'
  )
  RETURNING id INTO v_log_id;

  INSERT INTO public.duty_sign_in_admin_events (
    action,
    actor_member_id,
    duty_log_id,
    target_member_id,
    sign_in_time,
    reason
  )
  VALUES (
    'backfill',
    v_actor,
    v_log_id,
    p_member_id,
    p_sign_in_time,
    btrim(p_reason)
  );

  RETURN v_log_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION '该成员这一天已经有签到记录。'
      USING HINT = 'already_signed_in';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_studio_geofence(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters double precision,
  p_max_accuracy_meters double precision,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_previous public.studio_geofence%ROWTYPE;
BEGIN
  v_actor := public.assert_duty_admin(p_reason);

  IF p_latitude IS NULL
     OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION '围栏坐标无效。'
      USING HINT = 'invalid_coordinates';
  END IF;

  IF p_radius_meters IS NULL OR p_radius_meters < 20 OR p_radius_meters > 200 THEN
    RAISE EXCEPTION '围栏半径必须在 20 到 200 米之间。'
      USING HINT = 'radius_out_of_bounds';
  END IF;

  IF p_max_accuracy_meters IS NULL
     OR p_max_accuracy_meters < 30
     OR p_max_accuracy_meters > 200 THEN
    RAISE EXCEPTION '精度上限必须在 30 到 200 米之间。'
      USING HINT = 'accuracy_out_of_bounds';
  END IF;

  SELECT *
  INTO v_previous
  FROM public.studio_geofence
  WHERE id;

  IF NOT FOUND THEN
    INSERT INTO public.studio_geofence (
      id,
      latitude,
      longitude,
      radius_meters,
      max_accuracy_meters
    )
    VALUES (
      true,
      p_latitude,
      p_longitude,
      p_radius_meters,
      p_max_accuracy_meters
    );
  ELSE
    UPDATE public.studio_geofence
    SET
      latitude = p_latitude,
      longitude = p_longitude,
      radius_meters = p_radius_meters,
      max_accuracy_meters = p_max_accuracy_meters,
      updated_at = now()
    WHERE id;
  END IF;

  INSERT INTO public.studio_geofence_audits (
    actor_member_id,
    previous_latitude,
    previous_longitude,
    previous_radius_meters,
    previous_max_accuracy_meters,
    latitude,
    longitude,
    radius_meters,
    max_accuracy_meters,
    reason
  )
  VALUES (
    v_actor,
    v_previous.latitude,
    v_previous.longitude,
    v_previous.radius_meters,
    v_previous.max_accuracy_meters,
    p_latitude,
    p_longitude,
    p_radius_meters,
    p_max_accuracy_meters,
    btrim(p_reason)
  );
END;
$$;

-- 客户端只能读围栏。建表时的默认授权会留下 INSERT / DELETE / TRUNCATE。
DROP POLICY IF EXISTS studio_geofence_update_admin ON public.studio_geofence;
REVOKE ALL ON TABLE public.studio_geofence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_geofence TO authenticated;

-- 签到行的地点、核验、成员和日期不再通过表更新暴露给登录用户。
DROP POLICY IF EXISTS "仅允许管理员修改打卡记录" ON public.duty_logs;
REVOKE UPDATE, TRUNCATE ON TABLE public.duty_logs FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.is_china_public_holiday(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.duty_sign_in_instant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_duty_sign_in_window(uuid, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_duty_sign_in_geofence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_duty_sign_in_column_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_duty_admin(text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.current_member_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_current_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_duty_sign_in(double precision, double precision, double precision, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_duty_sign_in_invalid(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_backfill_duty_sign_in(uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_studio_geofence(double precision, double precision, double precision, double precision, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_duty_sign_in(double precision, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_duty_sign_in_invalid(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_backfill_duty_sign_in(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_studio_geofence(double precision, double precision, double precision, double precision, text) TO authenticated;
