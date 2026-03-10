-- ==========================================================
-- DEPRECATED
-- This file is kept for backward compatibility only.
-- Canonical definition of public.accept_duty_swap lives in:
--   database/update_swap_status.sql
-- ==========================================================

DO $$
BEGIN
  RAISE NOTICE 'accept_swap_rpc.sql is deprecated. Run database/update_swap_status.sql for canonical RPC definition.';
END
$$;
