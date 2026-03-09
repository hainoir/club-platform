-- ==========================================================
-- auth.users 触发器：自动同步新注册用户到 public.members
-- ==========================================================
-- 提示：在 Supabase SQL Editor 中运行此脚本，以保证每次注册时即使没有 Session 也能自动插表建档

-- 1. 创建或替换同步函数
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.members (
    id,
    email, 
    name, 
    role, 
    student_id, 
    department, 
    status, 
    join_date
  )
  VALUES (
    NEW.id,
    NEW.email,
    -- 尝试从元数据中解析我们刚才在 signUp 时传入的 name 等参数，如果没有提供则给默认值
    COALESCE(NEW.raw_user_meta_data->>'name', '新成员'),
    'member',
    NULLIF(NEW.raw_user_meta_data->>'student_id', '')::bigint,
    NEW.raw_user_meta_data->>'department',
    'active',
    CURRENT_DATE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 绑定触发器到 auth.users 插入事件
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
