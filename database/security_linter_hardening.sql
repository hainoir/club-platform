-- ==========================================================
-- Supabase database-linter hardening
-- ==========================================================
-- Apply after the canonical schema scripts in an existing Supabase project.
-- This file is intentionally idempotent and also handles legacy functions
-- that may exist in production but are no longer defined in this repository.

-- 1) Fix mutable search_path warnings for SECURITY DEFINER functions.
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

-- 2) Remove broad SELECT policies from the public events bucket.
-- Public object URLs work without a storage.objects SELECT policy, and broad
-- bucket SELECT policies allow clients to list all object names.
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "events_bucket_read" ON storage.objects;

-- 3) Revoke anonymous access to SECURITY DEFINER functions.
-- Client-facing RPCs keep authenticated execute grants because the app calls
-- them through Supabase RPC and each function performs its own auth checks.
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

-- 4) Trigger-only and maintenance functions should not be directly callable.
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

-- 5) Re-assert the authenticated grants required by current client RPC calls.
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
