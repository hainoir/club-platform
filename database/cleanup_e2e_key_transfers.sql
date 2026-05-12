-- 历史 E2E 钥匙交接夹具的一次性清理脚本。
-- 本脚本只处理 note 以 E2E-RPC-FIXTURE- 开头的记录。

-- 1) 预览将被删除的记录数量。
SELECT COUNT(*) AS matched_rows
FROM public.key_transfers
WHERE note ILIKE 'E2E-RPC-FIXTURE-%';

-- 2) 可选：预览最近匹配到的记录。
SELECT id, from_member_id, to_member_id, status, note, created_at, confirmed_at
FROM public.key_transfers
WHERE note ILIKE 'E2E-RPC-FIXTURE-%'
ORDER BY created_at DESC
LIMIT 50;

-- 3) 删除匹配到的记录。
DELETE FROM public.key_transfers
WHERE note ILIKE 'E2E-RPC-FIXTURE-%';
