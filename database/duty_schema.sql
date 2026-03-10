-- ==========================================================
-- Supabase Schema & RLS 绛栫暐鏂囦欢: 鍊肩彮琛ㄦā鍧?(Duty Roster)
-- ==========================================================

-- 1. 鍒涘缓鏋氫妇绫诲瀷涓庢暟鎹〃

-- 1.1 duty_rosters (甯歌鍛ㄦ帓鐝睜)
CREATE TABLE IF NOT EXISTS public.duty_rosters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int2 NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period int2 NOT NULL CHECK (period BETWEEN 1 AND 4),
  created_at timestamptz DEFAULT now(),
  -- 绾︽潫锛氬悓涓€涓汉鍦ㄥ悓涓€澶╁悓涓€鑺傚彧鑳芥湁涓€鏉℃帓鐝褰?
  UNIQUE(day_of_week, period, member_id)
);

-- 1.2 duty_logs (鍊肩彮鎵撳崱璁板綍娴佹按)
CREATE TABLE IF NOT EXISTS public.duty_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  sign_in_time timestamptz DEFAULT now(),
  location_verified boolean DEFAULT false,
  device_info text,
  week_number int4
);

-- 1.3 duty_swaps (鎹㈢彮/浠ｇ彮鐢宠搴?
CREATE TABLE IF NOT EXISTS public.duty_swaps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  original_day int2 NOT NULL CHECK (original_day BETWEEN 1 AND 5),
  original_period int2 NOT NULL CHECK (original_period BETWEEN 1 AND 4),
  target_day int2 CHECK (target_day BETWEEN 1 AND 5),
  target_period int2 CHECK (target_period BETWEEN 1 AND 4),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- ==========================================================
-- 2. 鍚敤琛岀骇瀹夊叏 (RLS)
-- ==========================================================
ALTER TABLE public.duty_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_swaps ENABLE ROW LEVEL SECURITY;

-- ==========================================================
-- 3. RLS 瀹夊叏绛栫暐閰嶇疆
-- ==========================================================

-- ----------------------------------------------------
-- 琛? duty_rosters (鎺掔彮姹?
-- ----------------------------------------------------
-- 鍏佽鎵€鏈夎璇佺敤鎴疯嚜鐢辨煡鐪嬫帓鐝儏鍐?
DROP POLICY IF EXISTS "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅鍊肩彮琛? ON public.duty_rosters;
CREATE POLICY "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅鍊肩彮琛?
ON public.duty_rosters FOR SELECT
TO authenticated
USING (true);

-- 鍏佽绠＄悊鍛樻垨鏈汉鎶ュ悕鎺掔彮
DROP POLICY IF EXISTS "鍏佽鑷繁鎶ュ悕鎴栫鐞嗗憳鎺掔彮" ON public.duty_rosters;
CREATE POLICY "鍏佽鑷繁鎶ュ悕鎴栫鐞嗗憳鎺掔彮"
ON public.duty_rosters FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND m.email = auth.jwt()->>'email'
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

-- 鍏佽鑷繁鍙栨秷鎺掔彮鎴栫鐞嗗憳鍒犻櫎
DROP POLICY IF EXISTS "鍏佽鑷繁鍙栨秷鎴栫鐞嗗憳鍒犻櫎鎺掔彮" ON public.duty_rosters;
CREATE POLICY "鍏佽鑷繁鍙栨秷鎴栫鐞嗗憳鍒犻櫎鎺掔彮"
ON public.duty_rosters FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND m.email = auth.jwt()->>'email'
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

-- ----------------------------------------------------
-- 琛? duty_logs (鎵撳崱娴佹按)
-- ----------------------------------------------------
-- 鍏佽澶у鏌ョ湅浠栦汉鐨勬墦鍗¤褰?(鐢ㄤ簬閫忔槑搴﹀拰鐪嬫澘)
DROP POLICY IF EXISTS "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅鎵撳崱璁板綍" ON public.duty_logs;
CREATE POLICY "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅鎵撳崱璁板綍"
ON public.duty_logs FOR SELECT
TO authenticated
USING (true);

-- 鍏佽鑷繁鎻愪氦鎵撳崱鎿嶄綔
DROP POLICY IF EXISTS "鍏佽鑷繁鎻愪氦鎵撳崱" ON public.duty_logs;
CREATE POLICY "鍏佽鑷繁鎻愪氦鎵撳崱"
ON public.duty_logs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = member_id AND m.email = auth.jwt()->>'email'
  )
);

-- 浠呭厑璁哥鐞嗗憳淇敼鎵撳崱璁板綍 (渚嬪琛ョ鎴栨爣璁版棤鏁?
DROP POLICY IF EXISTS "浠呭厑璁哥鐞嗗憳淇敼鎵撳崱璁板綍" ON public.duty_logs;
CREATE POLICY "浠呭厑璁哥鐞嗗憳淇敼鎵撳崱璁板綍"
ON public.duty_logs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

-- 浠呭厑璁哥鐞嗗憳鍒犻櫎鎵撳崱娴佹按 (闃蹭綔寮?
DROP POLICY IF EXISTS "浠呭厑璁哥鐞嗗憳鍒犻櫎鎵撳崱璁板綍" ON public.duty_logs;
CREATE POLICY "浠呭厑璁哥鐞嗗憳鍒犻櫎鎵撳崱璁板綍"
ON public.duty_logs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

-- ----------------------------------------------------
-- 琛? duty_swaps (鎹㈢彮鐢宠琛?
-- ----------------------------------------------------
-- 鍏佽鏌ョ湅澶у巺閲岀殑鎵€鏈夋崲鐝姹?
DROP POLICY IF EXISTS "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅鎹㈢彮璇锋眰" ON public.duty_swaps;
CREATE POLICY "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅鎹㈢彮璇锋眰"
ON public.duty_swaps FOR SELECT
TO authenticated
USING (true);

-- 鍏佽鍙戣捣鎹㈢彮 (璇锋眰浜哄繀椤绘槸鑷繁)
DROP POLICY IF EXISTS "鍏佽鍙戣捣鎹㈢彮鐢宠" ON public.duty_swaps;
CREATE POLICY "鍏佽鍙戣捣鎹㈢彮鐢宠"
ON public.duty_swaps FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = requester_id AND m.email = auth.jwt()->>'email'
  )
);

-- 鍏佽鏇存柊鎹㈢彮鐘舵€?(鐢宠浜哄彲浠ユ挙閿€锛岃鐢宠浜篬target]鍙互鍚屾剰/鎷掔粷锛岀鐞嗗憳鍙互骞查)
DROP POLICY IF EXISTS "鍏佽鐩稿叧鏂逛慨鏀规崲鐝姸鎬? ON public.duty_swaps;
CREATE POLICY "鍏佽鐩稿叧鏂逛慨鏀规崲鐝姸鎬?
ON public.duty_swaps FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id IN (requester_id, target_id) AND m.email = auth.jwt()->>'email'
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id IN (requester_id, target_id) AND m.email = auth.jwt()->>'email'
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

-- 鍏佽鎾ゅ洖(鍒犻櫎)鑷繁鍙戣捣鐨勬崲鐝紝鎴栫鐞嗗憳鐩存帴娓呯悊
DROP POLICY IF EXISTS "鍏佽鑷繁鎾ゅ洖鎴栫鐞嗗憳鍒犻櫎鎹㈢彮璇锋眰" ON public.duty_swaps;
CREATE POLICY "鍏佽鑷繁鎾ゅ洖鎴栫鐞嗗憳鍒犻櫎鎹㈢彮璇锋眰"
ON public.duty_swaps FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = requester_id AND m.email = auth.jwt()->>'email'
  )
  OR EXISTS (
    SELECT 1 FROM public.members admin
    WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

