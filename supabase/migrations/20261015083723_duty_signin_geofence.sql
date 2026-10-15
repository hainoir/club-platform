-- ==========================================================
-- 值班签到地理围栏：服务端强制校验
-- ==========================================================
-- 此前定位只发生在浏览器里。客户端调用 validateStudioLocation() 后，
-- 直接向 duty_logs 插入 location_verified = true，并不提交坐标。
-- RLS 只核对 member_id 是否属于当前登录用户，因此任何已登录成员都可以
-- 绕过前端，直接插入一条“已验证”的签到。
--
-- 本脚本把围栏变成数据库事实：
-- 1. public.studio_geofence 保存权威圆心、半径和精度上限。
-- 2. BEFORE INSERT 触发器拒绝围栏外、精度不足或缺少坐标的插入，并强制
--    把 location_verified 写成 true。客户端传入的布尔值不再被信任。
-- 3. public.submit_duty_sign_in 是唯一的客户端写入入口。它按会话解析
--    成员，不接受调用方传入的 member_id。
-- 4. 收回 authenticated / anon 对 duty_logs 的 INSERT，避免绕过 RPC。
--    触发器仍然覆盖 service role 等可以绕过 RLS 的写入。
--
-- 初始圆心与 lib/studio/studio-location.ts 的内置默认值一致
-- （纬度 39.181074，经度 117.12138，半径 50 米，精度上限 100 米）。
-- .env.example 里的坐标只是客户端提示占位符，不是事实来源。
-- 更换工作室时更新本表；重复执行本脚本不会覆盖已有配置。
-- 浏览器定位仍可被伪造坐标绕过，服务器无法证明设备真的在现场。
-- 本约束关闭的是“不提供坐标、直接声明已验证”这条旁路。

CREATE TABLE IF NOT EXISTS public.studio_geofence (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_meters double precision NOT NULL CHECK (radius_meters > 0),
  max_accuracy_meters double precision NOT NULL CHECK (max_accuracy_meters > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.studio_geofence IS
  '值班签到地理围栏的权威配置。客户端环境变量只做交互提示。';

INSERT INTO public.studio_geofence (
  id,
  latitude,
  longitude,
  radius_meters,
  max_accuracy_meters
)
VALUES (true, 39.181074, 117.12138, 50, 100)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.studio_geofence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_geofence_select_authenticated ON public.studio_geofence;
CREATE POLICY studio_geofence_select_authenticated
ON public.studio_geofence FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS studio_geofence_update_admin ON public.studio_geofence;
CREATE POLICY studio_geofence_update_admin
ON public.studio_geofence FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = auth.uid()
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
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.members admin
    WHERE (
      admin.id = auth.uid()
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
);

REVOKE ALL ON TABLE public.studio_geofence FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.studio_geofence TO authenticated;

ALTER TABLE public.duty_logs
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS accuracy_meters double precision,
  ADD COLUMN IF NOT EXISTS distance_meters double precision;

COMMENT ON COLUMN public.duty_logs.location_verified IS
  '由签到触发器在坐标通过围栏后写成 true。不要信任客户端传入的值。';

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

  -- 与 lib/studio/studio-location.ts 的 haversine 一致，地球半径 6371000 米。
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

REVOKE ALL ON FUNCTION public.enforce_duty_sign_in_geofence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_duty_sign_in_geofence() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_duty_sign_in_geofence() FROM authenticated;

DROP TRIGGER IF EXISTS trg_enforce_duty_sign_in_geofence ON public.duty_logs;
CREATE TRIGGER trg_enforce_duty_sign_in_geofence
BEFORE INSERT ON public.duty_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_duty_sign_in_geofence();

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
  v_today date := timezone('Asia/Shanghai', now())::date;
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

REVOKE ALL ON FUNCTION public.submit_duty_sign_in(double precision, double precision, double precision, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_duty_sign_in(double precision, double precision, double precision, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_duty_sign_in(double precision, double precision, double precision, text) TO authenticated;

-- 关闭直写。即便有人重新加上宽松的 INSERT 策略，触发器仍会检查坐标。
DROP POLICY IF EXISTS "允许自己提交打卡" ON public.duty_logs;
REVOKE INSERT ON TABLE public.duty_logs FROM PUBLIC, anon, authenticated;
