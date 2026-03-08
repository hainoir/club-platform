-- ==========================================================
-- Supabase Row Level Security (RLS) 策略文件
-- ==========================================================
-- 提示：将此文件中的 SQL 代码复制到 Supabase 的 SQL Editor 运行以启用真正的底层数据安全

-- 1. 开启表的 RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

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

-- 4. event_attendees 表策略
-- 允许所有查询 (内部所有登录用户可查看报名列表)
CREATE POLICY "允许认证用户读取活动参与者列表" 
ON event_attendees FOR SELECT 
TO authenticated 
USING (true);

-- 允许用户自己报名或管理员代为报名
CREATE POLICY "允许认证用户自行报名或管理员操作" 
ON event_attendees FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.jwt()->>'email' = user_email
  OR EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

-- 允许用户自己取消报名或管理员移除
CREATE POLICY "允许认证用户取消报名或管理员操作" 
ON event_attendees FOR DELETE 
TO authenticated 
USING (
  auth.jwt()->>'email' = user_email
  OR EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

-- 仅允许管理员更新（签到状态）
CREATE POLICY "仅允许管理员更新报名状态" 
ON event_attendees FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM members AS admin
    WHERE admin.email = auth.jwt()->>'email'
    AND admin.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

