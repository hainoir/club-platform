-- ==========================================================
-- 为 members 表添加 grade (年级) 列
-- ==========================================================
-- 提示：请在 Supabase SQL Editor 中手动执行此脚本

ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT NULL;

-- 添加注释说明
COMMENT ON COLUMN public.members.grade IS '年级：大一/大二/大三/大四';
