-- ==========================================================
-- 閽ュ寵绠＄悊 + 璇峰亣琛ョ彮 + 閽ュ寵浜ゆ帴 鏁版嵁搴?Schema
-- ==========================================================
-- 鎻愮ず锛氳鍦?Supabase SQL Editor 涓墽琛屾鑴氭湰

-- 1. duty_rosters 鏂板 has_key 瀛楁
ALTER TABLE public.duty_rosters
ADD COLUMN IF NOT EXISTS has_key boolean DEFAULT false;

COMMENT ON COLUMN public.duty_rosters.has_key IS '璇ユ帓鐝汉鍛樻槸鍚︽寔鏈夐挜鍖?;

-- 2. 璇峰亣璁板綍琛?
CREATE TABLE IF NOT EXISTS public.duty_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int2 NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period int2 NOT NULL CHECK (period BETWEEN 1 AND 4),
  reason text,
  penalty_shifts int2 NOT NULL DEFAULT 1 CHECK (penalty_shifts BETWEEN 1 AND 2),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at timestamptz DEFAULT now()
);

-- 3. 琛ョ彮瀹夋帓琛紙璇峰亣鏃堕€夋嫨鐨勪笅鍛ㄨˉ鍊肩彮鑺傛锛?
CREATE TABLE IF NOT EXISTS public.duty_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id uuid NOT NULL REFERENCES public.duty_leaves(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int2 NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period int2 NOT NULL CHECK (period BETWEEN 1 AND 4),
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 4. 閽ュ寵浜ゆ帴璁板綍琛?
CREATE TABLE IF NOT EXISTS public.key_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  to_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz
);

-- ==========================================================
-- 5. 鍚敤琛岀骇瀹夊叏 (RLS)
-- ==========================================================
ALTER TABLE public.duty_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_compensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_transfers ENABLE ROW LEVEL SECURITY;

-- ==========================================================
-- 6. RLS 绛栫暐
-- ==========================================================

-- duty_leaves: 鎵€鏈夎璇佺敤鎴峰彲鏌ョ湅锛屾湰浜哄彲鎻掑叆锛岀鐞嗗憳鍙慨鏀?
DROP POLICY IF EXISTS "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅璇峰亣" ON public.duty_leaves;
CREATE POLICY "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅璇峰亣"
ON public.duty_leaves FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "鍏佽鏈汉鎻愪氦璇峰亣" ON public.duty_leaves;
CREATE POLICY "鍏佽鏈汉鎻愪氦璇峰亣"
ON public.duty_leaves FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
);

DROP POLICY IF EXISTS "鍏佽绠＄悊鍛樻垨鏈汉鎿嶄綔璇峰亣" ON public.duty_leaves;
CREATE POLICY "鍏佽绠＄悊鍛樻垨鏈汉鎿嶄綔璇峰亣"
ON public.duty_leaves FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
  OR EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

DROP POLICY IF EXISTS "鍏佽绠＄悊鍛樻垨鏈汉鍒犻櫎璇峰亣" ON public.duty_leaves;
CREATE POLICY "鍏佽绠＄悊鍛樻垨鏈汉鍒犻櫎璇峰亣"
ON public.duty_leaves FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
  OR EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

-- duty_compensations: 涓?duty_leaves 涓€鑷?
DROP POLICY IF EXISTS "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅琛ョ彮" ON public.duty_compensations;
CREATE POLICY "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅琛ョ彮"
ON public.duty_compensations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "鍏佽鏈汉鎻愪氦琛ョ彮" ON public.duty_compensations;
CREATE POLICY "鍏佽鏈汉鎻愪氦琛ョ彮"
ON public.duty_compensations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id AND m.email = auth.jwt()->>'email')
);

-- key_transfers: 鎵€鏈夎璇佺敤鎴峰彲鏌ョ湅锛岀浉鍏虫柟鍙彃鍏?淇敼
DROP POLICY IF EXISTS "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅閽ュ寵浜ゆ帴" ON public.key_transfers;
CREATE POLICY "鍏佽璁よ瘉鐢ㄦ埛鏌ョ湅閽ュ寵浜ゆ帴"
ON public.key_transfers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "鍏佽鏈汉鍙戣捣閽ュ寵浜ゆ帴" ON public.key_transfers;
CREATE POLICY "鍏佽鏈汉鍙戣捣閽ュ寵浜ゆ帴"
ON public.key_transfers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.members m WHERE m.id = from_member_id AND m.email = auth.jwt()->>'email')
);

DROP POLICY IF EXISTS "鍏佽鐩稿叧鏂规洿鏂伴挜鍖欎氦鎺? ON public.key_transfers;
CREATE POLICY "鍏佽鐩稿叧鏂规洿鏂伴挜鍖欎氦鎺?
ON public.key_transfers FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id IN (from_member_id, to_member_id) AND m.email = auth.jwt()->>'email'
  )
);

-- duty_rosters 鏂板 UPDATE 绛栫暐锛堢敤浜庣鐞嗗憳鍒囨崲 has_key锛?
DROP POLICY IF EXISTS "鍏佽绠＄悊鍛樹慨鏀规帓鐝? ON public.duty_rosters;
CREATE POLICY "鍏佽绠＄悊鍛樹慨鏀规帓鐝?
ON public.duty_rosters FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.members admin WHERE admin.email = auth.jwt()->>'email'
      AND admin.role IN ('admin', U&'\4E3B\5E2D', U&'\6267\884C\4E3B\5E2D', U&'\526F\4E3B\5E2D', U&'\90E8\957F')
  )
);

-- RPC: 纭閽ュ寵浜ゆ帴锛堟帴鏀朵汉纭鍚庯紝鏇存柊鎺掔彮涓殑閽ュ寵鎸佹湁鐘舵€侊級
CREATE OR REPLACE FUNCTION public.confirm_key_transfer(p_transfer_id uuid, p_confirmer_id uuid)
RETURNS void AS $$
DECLARE
  v_transfer public.key_transfers%ROWTYPE;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: login required';
  END IF;

  IF v_actor_id <> p_confirmer_id THEN
    RAISE EXCEPTION 'Forbidden: confirmer must match current user';
  END IF;

  SELECT * INTO v_transfer
  FROM public.key_transfers
  WHERE id = p_transfer_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Key transfer not found or already confirmed';
  END IF;

  IF v_transfer.to_member_id <> v_actor_id THEN
    RAISE EXCEPTION 'Forbidden: only transfer receiver can confirm';
  END IF;

  UPDATE public.key_transfers
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_transfer_id;

  UPDATE public.duty_rosters
  SET has_key = false
  WHERE member_id = v_transfer.from_member_id;

  UPDATE public.duty_rosters
  SET has_key = true
  WHERE member_id = v_transfer.to_member_id;

  RAISE LOG 'confirm_key_transfer by % for transfer %', v_actor_id, p_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.confirm_key_transfer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_key_transfer(uuid, uuid) TO authenticated;





