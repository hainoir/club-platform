ALTER TABLE public.duty_leaves
ADD COLUMN IF NOT EXISTS leave_date date,
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.duty_leaves
SET
  leave_date = COALESCE(
    leave_date,
    (created_at AT TIME ZONE 'Asia/Shanghai')::date
    + (
      day_of_week
      - EXTRACT(ISODOW FROM (created_at AT TIME ZONE 'Asia/Shanghai'))::int
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS duty_leaves_set_expiry ON public.duty_leaves;
CREATE TRIGGER duty_leaves_set_expiry
BEFORE INSERT OR UPDATE OF leave_date, period ON public.duty_leaves
FOR EACH ROW
EXECUTE FUNCTION public.set_duty_leave_expiry();
