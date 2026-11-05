INSERT INTO tags (id, name, description, status)
VALUES
  (gen_random_uuid(), '食堂', '食堂、餐饮和营业时间', 'active'),
  (gen_random_uuid(), '自习', '自习室、图书馆和学习空间', 'active'),
  (gen_random_uuid(), '二手', '二手交易和闲置物品', 'active'),
  (gen_random_uuid(), '校园活动', '校园活动和学生服务', 'active')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    status = 'active';
