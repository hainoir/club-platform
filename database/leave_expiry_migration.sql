BEGIN;

ALTER TABLE public.duty_leaves
ADD COLUMN IF NOT EXISTS leave_date date,
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 旧记录无法可靠推断原计划请假的具体周次，因此保留记录但统一标记为已过期。
UPDATE public.duty_leaves
SET
  leave_date = COALESCE(
    leave_date,
    (COALESCE(created_at, now()) AT TIME ZONE 'Asia/Shanghai')::date
    + (
      day_of_week
      - EXTRACT(ISODOW FROM (COALESCE(created_at, now()) AT TIME ZONE 'Asia/Shanghai'))::int
    )
  ),
  expires_at = COALESCE(expires_at, now() - interval '1 second')
WHERE leave_date IS NULL OR expires_at IS NULL;

ALTER TABLE public.duty_leaves
ALTER COLUMN leave_date SET NOT NULL,
ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.duty_leaves
DROP CONSTRAINT IF EXISTS duty_leaves_date_matches_day,
ADD CONSTRAINT duty_leaves_date_matches_day
  CHECK ((EXTRACT(ISODOW FROM leave_date))::int = day_of_week);

CREATE OR REPLACE FUNCTION public.set_duty_leave_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  period_end time;
BEGIN
  CASE NEW.period
    WHEN 1 THEN period_end := TIME '09:35';
    WHEN 2 THEN period_end := TIME '11:40';
    WHEN 3 THEN period_end := TIME '15:05';
    WHEN 4 THEN period_end := TIME '17:10';
    ELSE RAISE EXCEPTION 'Invalid duty period: %', NEW.period;
  END CASE;

  IF (EXTRACT(ISODOW FROM NEW.leave_date))::int <> NEW.day_of_week THEN
    RAISE EXCEPTION 'leave_date weekday must match day_of_week';
  END IF;

  NEW.expires_at := (NEW.leave_date + period_end) AT TIME ZONE 'Asia/Shanghai';
  IF NEW.expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'Duty leave must end in the future';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_duty_leave_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.expires_at := OLD.expires_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_expired_duty_leave_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND OLD.expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'Expired duty leave cannot be approved';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_duty_leave_expiry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_duty_leave_expiry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_expired_duty_leave_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS duty_leaves_guard_expiry ON public.duty_leaves;
CREATE TRIGGER duty_leaves_guard_expiry
BEFORE UPDATE OF expires_at ON public.duty_leaves
FOR EACH ROW
EXECUTE FUNCTION public.guard_duty_leave_expiry();

DROP TRIGGER IF EXISTS duty_leaves_prevent_expired_approval ON public.duty_leaves;
CREATE TRIGGER duty_leaves_prevent_expired_approval
BEFORE UPDATE OF status ON public.duty_leaves
FOR EACH ROW
EXECUTE FUNCTION public.prevent_expired_duty_leave_approval();

DROP TRIGGER IF EXISTS duty_leaves_set_expiry ON public.duty_leaves;
CREATE TRIGGER duty_leaves_set_expiry
BEFORE INSERT OR UPDATE OF leave_date, period ON public.duty_leaves
FOR EACH ROW
EXECUTE FUNCTION public.set_duty_leave_expiry();

DROP POLICY IF EXISTS "允许本人提交请假" ON public.duty_leaves;
CREATE POLICY "允许本人提交请假"
ON public.duty_leaves FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = member_id
      AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email'))
  )
  AND EXISTS (
    SELECT 1
    FROM public.duty_rosters roster
    WHERE roster.member_id = public.duty_leaves.member_id
      AND roster.day_of_week = public.duty_leaves.day_of_week
      AND roster.period = public.duty_leaves.period
  )
);

DROP POLICY IF EXISTS "允许管理员或本人操作请假" ON public.duty_leaves;
CREATE POLICY "允许管理员或本人操作请假"
ON public.duty_leaves FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
  OR EXISTS (
    SELECT 1 FROM public.members admin WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
  )
)
WITH CHECK (
  (
    EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND lower(trim(m.email)) = lower(trim(auth.jwt()->>'email')))
    OR EXISTS (
      SELECT 1 FROM public.members admin WHERE lower(trim(admin.email)) = lower(trim(auth.jwt()->>'email'))
        AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F', U&'\7BA1\7406\5458')
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.duty_rosters roster
    WHERE roster.member_id = public.duty_leaves.member_id
      AND roster.day_of_week = public.duty_leaves.day_of_week
      AND roster.period = public.duty_leaves.period
  )
);

COMMIT;
