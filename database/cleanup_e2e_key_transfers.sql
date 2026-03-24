-- One-time cleanup for historical E2E key-transfer fixtures.
-- This script only targets rows whose note starts with E2E-RPC-FIXTURE-.

-- 1) Preview how many rows will be deleted.
SELECT COUNT(*) AS matched_rows
FROM public.key_transfers
WHERE note ILIKE 'E2E-RPC-FIXTURE-%';

-- 2) Optional preview of recent matched rows.
SELECT id, from_member_id, to_member_id, status, note, created_at, confirmed_at
FROM public.key_transfers
WHERE note ILIKE 'E2E-RPC-FIXTURE-%'
ORDER BY created_at DESC
LIMIT 50;

-- 3) Delete matched rows.
DELETE FROM public.key_transfers
WHERE note ILIKE 'E2E-RPC-FIXTURE-%';
