-- ==========================================================
-- 值班签到删除审计
-- ==========================================================
-- 在 20261015092000_duty_sign_in_enforcement.sql 之后执行。
-- 重复执行是安全的。不要重放更早的基线迁移。
--
-- 登录用户不能再直接 DELETE duty_logs。管理员走 delete_duty_sign_in，
-- 必须填写原因。postgres / service_role 的直接删除仍会命中 BEFORE DELETE
-- 触发器，并留下同一张审计表里的快照。

ALTER TABLE public.duty_sign_in_admin_events
  ADD COLUMN IF NOT EXISTS actor_uid uuid,
  ADD COLUMN IF NOT EXISTS actor_session_user text,
  ADD COLUMN IF NOT EXISTS row_snapshot jsonb;

ALTER TABLE public.duty_sign_in_admin_events
  ALTER COLUMN actor_member_id DROP NOT NULL;

-- 删行之后仍要能按原来的 duty_logs.id 查到审计。ON DELETE SET NULL 会把这个
-- 指针清掉，所以去掉外键，只保留 uuid。
ALTER TABLE public.duty_sign_in_admin_events
  DROP CONSTRAINT IF EXISTS duty_sign_in_admin_events_duty_log_id_fkey;

-- 删除成员会级联删除其签到。审计行不能再挡住这次删除；成员 id 留在快照里。
ALTER TABLE public.duty_sign_in_admin_events
  DROP CONSTRAINT IF EXISTS duty_sign_in_admin_events_actor_member_id_fkey;

ALTER TABLE public.duty_sign_in_admin_events
  ADD CONSTRAINT duty_sign_in_admin_events_actor_member_id_fkey
  FOREIGN KEY (actor_member_id) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE public.duty_sign_in_admin_events
  DROP CONSTRAINT IF EXISTS duty_sign_in_admin_events_action_check;

ALTER TABLE public.duty_sign_in_admin_events
  ADD CONSTRAINT duty_sign_in_admin_events_action_check
  CHECK (action IN ('backfill', 'mark_invalid', 'delete'));

CREATE OR REPLACE FUNCTION public.audit_duty_sign_in_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text := nullif(btrim(current_setting('duty.delete_reason', true)), '');
BEGIN
  -- 管理员函数会在同一事务里写入原因。没有原因的删除来自表所有者或
  -- service_role 的直接 DELETE，仍然要留下快照。
  IF v_reason IS NULL THEN
    v_reason := 'direct delete';
  END IF;

  BEGIN
    INSERT INTO public.duty_sign_in_admin_events (
      action,
      actor_member_id,
      actor_uid,
      actor_session_user,
      duty_log_id,
      target_member_id,
      sign_in_time,
      reason,
      row_snapshot
    )
    VALUES (
      'delete',
      public.current_member_id(),
      auth.uid(),
      session_user,
      OLD.id,
      OLD.member_id,
      OLD.sign_in_time,
      v_reason,
      to_jsonb(OLD)
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- 成员删除会级联删掉签到，此时成员行已经不能再被外键引用。
      -- 成员 id 仍留在 row_snapshot 里。
      INSERT INTO public.duty_sign_in_admin_events (
        action,
        actor_member_id,
        actor_uid,
        actor_session_user,
        duty_log_id,
        target_member_id,
        sign_in_time,
        reason,
        row_snapshot
      )
      VALUES (
        'delete',
        NULL,
        auth.uid(),
        session_user,
        OLD.id,
        NULL,
        OLD.sign_in_time,
        v_reason,
        to_jsonb(OLD)
      );
  END;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_duty_sign_in_delete ON public.duty_logs;
CREATE TRIGGER trg_audit_duty_sign_in_delete
BEFORE DELETE ON public.duty_logs
FOR EACH ROW
EXECUTE FUNCTION public.audit_duty_sign_in_delete();

CREATE OR REPLACE FUNCTION public.delete_duty_sign_in(
  p_log_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted uuid;
BEGIN
  PERFORM public.assert_duty_admin(p_reason);

  IF p_log_id IS NULL THEN
    RAISE EXCEPTION '没有这条签到记录。'
      USING HINT = 'log_not_found';
  END IF;

  PERFORM set_config('duty.delete_reason', btrim(p_reason), true);

  DELETE FROM public.duty_logs
  WHERE id = p_log_id
  RETURNING id INTO v_deleted;

  IF v_deleted IS NULL THEN
    RAISE EXCEPTION '没有这条签到记录。'
      USING HINT = 'log_not_found';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "仅允许管理员删除打卡记录" ON public.duty_logs;
REVOKE DELETE ON TABLE public.duty_logs FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.audit_duty_sign_in_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_duty_sign_in(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_duty_sign_in(uuid, text) TO authenticated;
