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
DROP POLICY IF EXISTS "允许认证用户读取所有成员信息" ON members;
CREATE POLICY "允许认证用户读取所有成员信息" 
ON members FOR SELECT 
TO authenticated 
USING (true);

-- 允许主席/管理员组修改成员信息
-- 注意：这里使用关联子查询来验证当前操作者的 role 身份
DROP POLICY IF EXISTS "允许管理员更新成员" ON members;
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

DROP POLICY IF EXISTS "允许管理员插入成员" ON members;
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

-- 允许新落地的用户自行提交注册表单（限制只能写自己的邮箱且角色只能是会员）
DROP POLICY IF EXISTS "允许新用户自助注册记录" ON members;
CREATE POLICY "允许新用户自助注册记录" 
ON members FOR INSERT 
TO authenticated 
WITH CHECK (
  email = auth.jwt()->>'email'
  AND role = 'member'
);

DROP POLICY IF EXISTS "允许管理员删除成员" ON members;
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
DROP POLICY IF EXISTS "允许任何人/认证用户读取活动" ON events;
CREATE POLICY "允许任何人/认证用户读取活动" 
ON events FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "允许管理员更新活动" ON events;
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

DROP POLICY IF EXISTS "允许管理员插入活动" ON events;
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

DROP POLICY IF EXISTS "允许管理员删除活动" ON events;
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
DROP POLICY IF EXISTS "允许认证用户读取活动参与者列表" ON event_attendees;
CREATE POLICY "允许认证用户读取活动参与者列表" 
ON event_attendees FOR SELECT 
TO authenticated 
USING (true);

-- 允许用户自己报名或管理员代为报名
DROP POLICY IF EXISTS "允许认证用户自行报名或管理员操作" ON event_attendees;
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
DROP POLICY IF EXISTS "允许认证用户取消报名或管理员操作" ON event_attendees;
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
DROP POLICY IF EXISTS "仅允许管理员更新报名状态" ON event_attendees;
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

-- ==========================================================
-- 5. Storage (文件存储) 策略
-- 针对 events bucket (用于上传活动封面海报)
-- 注意：需要先在 Supabase 控制台中创建名为 'events' 的 bucket
-- ==========================================================

-- 允许认证用户读取活动封面海报
DROP POLICY IF EXISTS "events_bucket_read" ON storage.objects;
CREATE POLICY "events_bucket_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'events');

-- 仅允许管理员上传 (Insert) 图片
DROP POLICY IF EXISTS "events_bucket_insert_admin" ON storage.objects;
CREATE POLICY "events_bucket_insert_admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'events'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.email = auth.jwt()->>'email'
      AND m.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

-- 仅允许管理员更新 (Update) 图片
DROP POLICY IF EXISTS "events_bucket_update_admin" ON storage.objects;
CREATE POLICY "events_bucket_update_admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'events'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.email = auth.jwt()->>'email'
      AND m.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
)
WITH CHECK (
  bucket_id = 'events'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.email = auth.jwt()->>'email'
      AND m.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

-- 仅允许管理员删除 (Delete) 图片
DROP POLICY IF EXISTS "events_bucket_delete_admin" ON storage.objects;
CREATE POLICY "events_bucket_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'events'
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.email = auth.jwt()->>'email'
      AND m.role IN ('admin', '主席', '执行主席', '副主席', '部长')
  )
);

