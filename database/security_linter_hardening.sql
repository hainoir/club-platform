-- ==========================================================
-- Supabase 数据库检查器加固
-- ==========================================================
-- 在已有 Supabase 项目中，请于权威 schema 脚本之后执行。
-- 本文件被刻意设计为幂等，同时也会处理那些可能仍存在于生产环境、
-- 但仓库里已经不再定义的历史函数。

-- 1) 修复 SECURITY DEFINER 函数的可变 search_path 告警。
DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT *
    FROM (
      VALUES
        ('public.get_user_role(text)'),
        ('public.handle_new_user()')
    ) AS signatures(name)
    WHERE to_regprocedure(signatures.name) IS NOT NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', function_signature);
  END LOOP;
END;
$$;

-- 2) 移除公开 events bucket 上过宽的 SELECT 策略。
-- 公开对象链接在没有 storage.objects SELECT 策略时也能访问，而宽泛的
-- bucket SELECT 策略会允许客户端枚举全部对象名称。
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "events_bucket_read" ON storage.objects;

-- 3) 撤销匿名用户对 SECURITY DEFINER 函数的访问权限。
-- 面向客户端的 RPC 仍保留 authenticated 执行权限，因为应用会通过
-- Supabase RPC 调用它们，而且每个函数内部还会自行执行鉴权检查。
DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT *
    FROM (
      VALUES
        ('public.accept_duty_swap(uuid, uuid)'),
        ('public.approve_duty_leave(uuid)'),
        ('public.confirm_key_transfer(uuid, uuid)'),
        ('public.current_member_id()'),
        ('public.get_user_role(text)'),
        ('public.handle_new_user()'),
        ('public.is_current_admin()'),
        ('public.return_duty_swap_to_hall(uuid)'),
        ('public.rls_auto_enable()'),
        ('public.sync_duty_sign_in_date()'),
        ('public.volunteer_for_duty_swap(uuid)')
    ) AS signatures(name)
    WHERE to_regprocedure(signatures.name) IS NOT NULL
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', function_signature);
  END LOOP;
END;
$$;

-- 4) 仅供触发器和维护使用的函数不应被直接调用。
DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT *
    FROM (
      VALUES
        ('public.handle_new_user()'),
        ('public.rls_auto_enable()'),
        ('public.sync_duty_sign_in_date()')
    ) AS signatures(name)
    WHERE to_regprocedure(signatures.name) IS NOT NULL
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', function_signature);
  END LOOP;
END;
$$;

-- 5) 重新确认当前客户端 RPC 调用所需的 authenticated 授权。
DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT *
    FROM (
      VALUES
        ('public.accept_duty_swap(uuid, uuid)'),
        ('public.approve_duty_leave(uuid)'),
        ('public.confirm_key_transfer(uuid, uuid)'),
        ('public.return_duty_swap_to_hall(uuid)'),
        ('public.volunteer_for_duty_swap(uuid)')
    ) AS signatures(name)
    WHERE to_regprocedure(signatures.name) IS NOT NULL
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
  END LOOP;
END;
$$;
