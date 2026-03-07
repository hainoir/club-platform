-- ==========================================================
-- Supabase Row Level Security (RLS) 策略文件
-- ==========================================================
-- 提示：将此文件中的 SQL 代码复制到 Supabase 的 SQL Editor 运行以启用真正的底层数据安全

-- 1. 开启表的 RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 2. members 表策略
-- 允许所有查询 (内部所有登录用户可互看)
CREATE POLICY "允许认证用户读取所有成员信息" 
ON members FOR SELECT 
TO authenticated 
USING (true);

-- 允许主席/管理员组修改成员信息
-- 注意：这里使用关联子查询来验证当前操作者的 role 身份
CREATE POLICY "允许管理员更新成员" 
ON members FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

CREATE POLICY "允许管理员插入成员" 
ON members FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

CREATE POLICY "允许管理员删除成员" 
ON members FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

-- 3. events 表策略
CREATE POLICY "允许任何人/认证用户读取活动" 
ON events FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "允许管理员更新活动" 
ON events FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

CREATE POLICY "允许管理员插入活动" 
ON events FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

CREATE POLICY "允许管理员删除活动" 
ON events FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);
