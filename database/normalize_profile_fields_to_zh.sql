-- ==========================================================
-- 统一部门/年级字段为中文（一次性回填）
-- ==========================================================
-- 适用场景：历史数据中包含英文枚举（Development/Freshman 等）
-- 说明：仅匹配已知英文值，不改动已有中文值、空值或其他自定义值

BEGIN;

UPDATE public.members
SET
  department = CASE department
    WHEN 'Design' THEN '设计部'
    WHEN 'Development' THEN '开发部'
    WHEN 'Photography' THEN '摄影部'
    WHEN 'unassigned' THEN '未分配'
    ELSE department
  END,
  grade = CASE grade
    WHEN 'Freshman' THEN '大一'
    WHEN 'Sophomore' THEN '大二'
    WHEN 'Junior' THEN '大三'
    WHEN 'Senior' THEN '大四'
    ELSE grade
  END
WHERE
  department IN ('Design', 'Development', 'Photography', 'unassigned')
  OR grade IN ('Freshman', 'Sophomore', 'Junior', 'Senior');

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{department}',
  to_jsonb(
    CASE raw_user_meta_data->>'department'
      WHEN 'Design' THEN '设计部'
      WHEN 'Development' THEN '开发部'
      WHEN 'Photography' THEN '摄影部'
      WHEN 'unassigned' THEN '未分配'
      ELSE raw_user_meta_data->>'department'
    END
  ),
  true
)
WHERE raw_user_meta_data->>'department' IN ('Design', 'Development', 'Photography', 'unassigned');

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{grade}',
  to_jsonb(
    CASE raw_user_meta_data->>'grade'
      WHEN 'Freshman' THEN '大一'
      WHEN 'Sophomore' THEN '大二'
      WHEN 'Junior' THEN '大三'
      WHEN 'Senior' THEN '大四'
      ELSE raw_user_meta_data->>'grade'
    END
  ),
  true
)
WHERE raw_user_meta_data->>'grade' IN ('Freshman', 'Sophomore', 'Junior', 'Senior');

COMMIT;
