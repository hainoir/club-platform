-- ==========================================================
-- Patch: sign-in de-duplication + RSVP uniqueness hardening
-- ==========================================================

-- 1) Remove duplicate RSVP rows, keeping the earliest row per (event_id, email)
DELETE FROM public.event_attendees a
USING public.event_attendees b
WHERE a.id > b.id
  AND a.event_id = b.event_id
  AND lower(a.user_email) = lower(b.user_email);

-- 2) Enforce case-insensitive RSVP uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS event_attendees_event_email_unique
ON public.event_attendees (event_id, lower(user_email));

-- 3) Add sign_in_date to duty_logs (derived in Asia/Shanghai local day)
ALTER TABLE public.duty_logs
ADD COLUMN IF NOT EXISTS sign_in_date date;

UPDATE public.duty_logs
SET sign_in_date = timezone('Asia/Shanghai', sign_in_time)::date
WHERE sign_in_date IS NULL;

-- 4) Remove duplicate duty sign-ins, keeping earliest row per (member_id, local day)
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY member_id, timezone('Asia/Shanghai', sign_in_time)::date
      ORDER BY sign_in_time ASC, id ASC
    ) AS rn
  FROM public.duty_logs
)
DELETE FROM public.duty_logs d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- 5) Keep sign_in_date synchronized from sign_in_time
CREATE OR REPLACE FUNCTION public.sync_duty_sign_in_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.sign_in_time := COALESCE(NEW.sign_in_time, now());
  NEW.sign_in_date := timezone('Asia/Shanghai', NEW.sign_in_time)::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_duty_sign_in_date ON public.duty_logs;
CREATE TRIGGER trg_sync_duty_sign_in_date
BEFORE INSERT OR UPDATE OF sign_in_time ON public.duty_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_duty_sign_in_date();

-- 6) Enforce one sign-in per member per day
ALTER TABLE public.duty_logs
ALTER COLUMN sign_in_date SET NOT NULL;

ALTER TABLE public.duty_logs
ALTER COLUMN sign_in_date SET DEFAULT timezone('Asia/Shanghai', now())::date;

CREATE UNIQUE INDEX IF NOT EXISTS duty_logs_member_sign_in_date_unique
ON public.duty_logs (member_id, sign_in_date);

REVOKE ALL ON FUNCTION public.sync_duty_sign_in_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_duty_sign_in_date() TO authenticated;