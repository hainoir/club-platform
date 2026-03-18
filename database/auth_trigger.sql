-- ==========================================================
-- 认证用户表触发器：自动同步新注册用户到成员表
-- ==========================================================
-- 提示：在数据库控制台的查询编辑器中运行此脚本，以保证每次注册时即使没有会话也能自动插表建档

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
    grade,
    status, 
    join_date
  )
  VALUES (
    NEW.id,
    NEW.email,
    -- 尝试从元数据中解析注册时传入的姓名等参数，若未提供则使用默认值
    COALESCE(NEW.raw_user_meta_data->>'name', '新成员'),
    'member',
    NULLIF(NEW.raw_user_meta_data->>'student_id', '')::bigint,
    NEW.raw_user_meta_data->>'department',
    NEW.raw_user_meta_data->>'grade',
    'active',
    CURRENT_DATE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 绑定触发器到认证用户表插入事件
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
