-- ==========================================================
-- PWA Web Push：订阅、偏好、通知 outbox、设备发送记录与业务触发器
-- ==========================================================
-- 执行顺序：在 key_and_leave_schema.sql、update_swap_status.sql 之后执行。
-- 本脚本不会自动创建远程 Cron，因为生产 URL 与密钥必须通过 Supabase
-- Dashboard / Vault 配置，不能写入版本库。

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  web_push_enabled boolean NOT NULL DEFAULT false,
  duty_reminder boolean NOT NULL DEFAULT true,
  key_transfer_reminder boolean NOT NULL DEFAULT true,
  leave_reminder boolean NOT NULL DEFAULT true,
  swap_reminder boolean NOT NULL DEFAULT true,
  event_reminder boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  platform text,
  device_label text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_member_active_idx
ON public.push_subscriptions (member_id, status);

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  target_url text NOT NULL DEFAULT '/',
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'high')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'retry', 'failed', 'suppressed', 'expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  worker_id text,
  processing_started_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_outbox_dispatch_idx
ON public.notification_outbox (status, scheduled_at, next_attempt_at, expires_at);

CREATE INDEX IF NOT EXISTS notification_outbox_recipient_idx
ON public.notification_outbox (recipient_member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'retry', 'failed', 'subscription_expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  response_status integer,
  error_message text,
  sent_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outbox_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS push_deliveries_outbox_idx
ON public.push_deliveries (outbox_id, status);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.notification_outbox FROM anon, authenticated;
REVOKE ALL ON public.push_deliveries FROM anon, authenticated;

GRANT ALL ON public.notification_preferences TO service_role;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT ALL ON public.notification_outbox TO service_role;
GRANT ALL ON public.push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.touch_push_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_push_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notification_preferences_touch_updated_at ON public.notification_preferences;
CREATE TRIGGER notification_preferences_touch_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_push_updated_at();

DROP TRIGGER IF EXISTS push_subscriptions_touch_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_touch_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.touch_push_updated_at();

DROP TRIGGER IF EXISTS notification_outbox_touch_updated_at ON public.notification_outbox;
CREATE TRIGGER notification_outbox_touch_updated_at
BEFORE UPDATE ON public.notification_outbox
FOR EACH ROW EXECUTE FUNCTION public.touch_push_updated_at();

DROP TRIGGER IF EXISTS push_deliveries_touch_updated_at ON public.push_deliveries;
CREATE TRIGGER push_deliveries_touch_updated_at
BEFORE UPDATE ON public.push_deliveries
FOR EACH ROW EXECUTE FUNCTION public.touch_push_updated_at();

CREATE OR REPLACE FUNCTION public.is_push_admin_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(trim(COALESCE(p_role, ''))) = 'admin'
    OR trim(COALESCE(p_role, '')) IN ('管理员', '主席', '执行主席', '副主席', '部长');
$$;

REVOKE ALL ON FUNCTION public.is_push_admin_role(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_push_admin_role(text) TO service_role;

CREATE OR REPLACE FUNCTION public.push_duty_slot_label(p_day integer, p_period integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_day
      WHEN 1 THEN '周一'
      WHEN 2 THEN '周二'
      WHEN 3 THEN '周三'
      WHEN 4 THEN '周四'
      WHEN 5 THEN '周五'
      ELSE '值班日'
    END || ' 第' || p_period || '节';
$$;

REVOKE ALL ON FUNCTION public.push_duty_slot_label(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_duty_slot_label(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_push_notification(
  p_recipient_member_id uuid,
  p_notification_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text,
  p_title text,
  p_body text,
  p_target_url text,
  p_urgency text,
  p_scheduled_at timestamptz,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient_member_id IS NULL OR p_expires_at <= statement_timestamp() THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_outbox (
    recipient_member_id,
    notification_type,
    entity_type,
    entity_id,
    dedupe_key,
    title,
    body,
    target_url,
    urgency,
    scheduled_at,
    expires_at
  )
  VALUES (
    p_recipient_member_id,
    p_notification_type,
    p_entity_type,
    p_entity_id,
    p_dedupe_key,
    left(p_title, 80),
    left(p_body, 180),
    CASE WHEN p_target_url LIKE '/%' THEN p_target_url ELSE '/' END,
    CASE WHEN p_urgency = 'high' THEN 'high' ELSE 'normal' END,
    GREATEST(p_scheduled_at, statement_timestamp()),
    p_expires_at
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_push_notification(
  uuid, text, text, uuid, text, text, text, text, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_push_notification(
  uuid, text, text, uuid, text, text, text, text, text, timestamptz, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_key_transfer_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.enqueue_push_notification(
      NEW.to_member_id,
      'key_transfer_created',
      'key_transfer',
      NEW.id,
      'key-transfer:' || NEW.id || ':created:' || NEW.to_member_id,
      '待确认钥匙交接',
      '你有一项钥匙交接等待确认。',
      '/',
      'high',
      statement_timestamp(),
      LEAST(COALESCE(NEW.created_at, statement_timestamp()) + interval '24 hours', statement_timestamp() + interval '24 hours')
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'confirmed' AND NEW.from_member_id IS NOT NULL THEN
    PERFORM public.enqueue_push_notification(
      NEW.from_member_id,
      'key_transfer_confirmed',
      'key_transfer',
      NEW.id,
      'key-transfer:' || NEW.id || ':confirmed:' || NEW.from_member_id,
      '钥匙交接已确认',
      '接收人已经确认本次钥匙交接。',
      '/',
      'normal',
      statement_timestamp(),
      statement_timestamp() + interval '24 hours'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_key_transfer_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS key_transfers_enqueue_push ON public.key_transfers;
CREATE TRIGGER key_transfers_enqueue_push
AFTER INSERT OR UPDATE ON public.key_transfers
FOR EACH ROW EXECUTE FUNCTION public.enqueue_key_transfer_push();

CREATE OR REPLACE FUNCTION public.enqueue_swap_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_member record;
  slot_label text;
BEGIN
  slot_label := public.push_duty_slot_label(NEW.original_day, NEW.original_period);
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.target_id IS NOT NULL THEN
    PERFORM public.enqueue_push_notification(
      NEW.target_id,
      'swap_target_invited',
      'duty_swap',
      NEW.id,
      'swap:' || NEW.id || ':target-invited:' || NEW.target_id,
      '你收到一项代班邀请',
      slot_label || ' 等待你处理。',
      '/duty',
      'high',
      statement_timestamp(),
      statement_timestamp() + interval '7 days'
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    PERFORM public.enqueue_push_notification(
      NEW.requester_id,
      'swap_accepted_requester',
      'duty_swap',
      NEW.id,
      'swap:' || NEW.id || ':accepted-requester:' || NEW.requester_id,
      '代班邀请已被接受',
      slot_label || ' 已有人应答，等待管理员审批。',
      '/duty',
      'normal',
      statement_timestamp(),
      statement_timestamp() + interval '24 hours'
    );

    FOR admin_member IN
      SELECT id FROM public.members WHERE public.is_push_admin_role(role)
    LOOP
      PERFORM public.enqueue_push_notification(
        admin_member.id,
        'swap_accepted_admin',
        'duty_swap',
        NEW.id,
        'swap:' || NEW.id || ':accepted-admin:' || admin_member.id,
        '有一项代班等待审批',
        slot_label || ' 已有人应答，请及时处理。',
        '/duty',
        'high',
        statement_timestamp(),
        statement_timestamp() + interval '24 hours'
      );
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status = 'approved' THEN
    PERFORM public.enqueue_push_notification(
      NEW.requester_id,
      'swap_approved_requester',
      'duty_swap',
      NEW.id,
      'swap:' || NEW.id || ':approved-requester:' || NEW.requester_id,
      '代班已批准',
      slot_label || ' 的代班安排已经生效。',
      '/duty',
      'normal',
      statement_timestamp(),
      statement_timestamp() + interval '24 hours'
    );

    IF NEW.target_id IS NOT NULL THEN
      PERFORM public.enqueue_push_notification(
        NEW.target_id,
        'swap_approved_target',
        'duty_swap',
        NEW.id,
        'swap:' || NEW.id || ':approved-target:' || NEW.target_id,
        '代班已批准',
        '你将负责 ' || slot_label || '，请按时到岗。',
        '/duty',
        'high',
        statement_timestamp(),
        statement_timestamp() + interval '24 hours'
      );
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.target_id IS NOT NULL
     AND NEW.target_id IS NULL
     AND NEW.status = 'pending' THEN
    PERFORM public.enqueue_push_notification(
      NEW.requester_id,
      'swap_returned_to_hall',
      'duty_swap',
      NEW.id,
      'swap:' || NEW.id || ':returned:' || NEW.requester_id || ':' || extract(epoch FROM statement_timestamp())::bigint,
      '代班已退回公共大厅',
      slot_label || ' 将重新等待其他成员应答。',
      '/duty',
      'normal',
      statement_timestamp(),
      statement_timestamp() + interval '24 hours'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_swap_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS duty_swaps_enqueue_push ON public.duty_swaps;
CREATE TRIGGER duty_swaps_enqueue_push
AFTER INSERT OR UPDATE ON public.duty_swaps
FOR EACH ROW EXECUTE FUNCTION public.enqueue_swap_push();

CREATE OR REPLACE FUNCTION public.enqueue_leave_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_member record;
  slot_label text;
BEGIN
  slot_label := public.push_duty_slot_label(NEW.day_of_week, NEW.period);
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    FOR admin_member IN
      SELECT id FROM public.members WHERE public.is_push_admin_role(role)
    LOOP
      PERFORM public.enqueue_push_notification(
        admin_member.id,
        'leave_pending_admin',
        'duty_leave',
        NEW.id,
        'leave:' || NEW.id || ':pending-admin:' || admin_member.id,
        '有一项请假等待审批',
        NEW.leave_date || ' ' || slot_label || ' 请假等待处理。',
        '/duty',
        'high',
        statement_timestamp() + interval '30 seconds',
        NEW.expires_at
      );
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'approved' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.duty_swaps
      WHERE leave_id = NEW.id AND status = 'approved'
    ) THEN
      PERFORM public.enqueue_push_notification(
        NEW.member_id,
        'leave_approved',
        'duty_leave',
        NEW.id,
        'leave:' || NEW.id || ':approved:' || NEW.member_id,
        '请假已批准',
        NEW.leave_date || ' ' || slot_label || ' 的请假已经生效。',
        '/',
        'normal',
        statement_timestamp(),
        statement_timestamp() + interval '24 hours'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_leave_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS duty_leaves_enqueue_push ON public.duty_leaves;
CREATE TRIGGER duty_leaves_enqueue_push
AFTER INSERT OR UPDATE ON public.duty_leaves
FOR EACH ROW EXECUTE FUNCTION public.enqueue_leave_push();

CREATE OR REPLACE FUNCTION public.release_stale_push_jobs(p_stale_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  released_count integer;
BEGIN
  UPDATE public.notification_outbox
  SET status = 'retry',
      worker_id = NULL,
      processing_started_at = NULL,
      next_attempt_at = statement_timestamp(),
      last_error = 'Recovered stale processing job'
  WHERE status = 'processing'
    AND processing_started_at < p_stale_before;

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_push_jobs(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_push_jobs(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_push_outbox(p_batch_size integer, p_worker_id text)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.release_stale_push_jobs(statement_timestamp() - interval '5 minutes');

  UPDATE public.notification_outbox
  SET status = 'expired',
      worker_id = NULL,
      processing_started_at = NULL
  WHERE status IN ('pending', 'retry', 'processing')
    AND expires_at <= statement_timestamp();

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.notification_outbox
    WHERE status IN ('pending', 'retry')
      AND scheduled_at <= statement_timestamp()
      AND expires_at > statement_timestamp()
      AND (next_attempt_at IS NULL OR next_attempt_at <= statement_timestamp())
    ORDER BY CASE urgency WHEN 'high' THEN 0 ELSE 1 END, scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_batch_size, 1), 100)
  )
  UPDATE public.notification_outbox outbox
  SET status = 'processing',
      attempts = outbox.attempts + 1,
      worker_id = left(p_worker_id, 120),
      processing_started_at = statement_timestamp(),
      last_error = NULL
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_push_outbox(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(integer, text) TO service_role;

COMMENT ON TABLE public.push_subscriptions IS 'Web Push capability endpoints; never expose endpoint/p256dh/auth to ordinary clients.';
COMMENT ON TABLE public.notification_outbox IS 'One logical notification per recipient, deduplicated by business stage.';
COMMENT ON TABLE public.push_deliveries IS 'One delivery attempt stream per outbox and device subscription.';

-- 生产调度建议（通过 Supabase Dashboard -> Integrations -> Cron 配置）：
--   Schedule: * * * * *
--   Method: POST
--   URL: https://<production-domain>/api/internal/push/dispatch
--   Header: Authorization: Bearer <PUSH_DISPATCH_SECRET stored in Vault>
-- 不要把真实 URL 密钥提交到本文件。
