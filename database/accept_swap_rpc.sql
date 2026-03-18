-- ==========================================================
-- 已废弃
-- 此文件仅为向后兼容保留。
-- 换班审批函数的权威定义位于更新换班状态脚本。
-- ==========================================================

DO $$
BEGIN
  RAISE NOTICE 'accept_swap_rpc.sql is deprecated. Run database/update_swap_status.sql for canonical RPC definition.';
END
$$;
