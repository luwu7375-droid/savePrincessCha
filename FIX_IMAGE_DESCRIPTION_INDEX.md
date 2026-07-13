# 修复图片描述索引错误

## 问题描述

错误信息：
```
index row size 2752 exceeds btree version 4 maximum 2704 for index "idx_messages_image_description"
```

**根本原因**：
- `image_description` 字段可能包含非常长的文本（超过 2704 字节）
- 原有索���尝试对整个 text 字段建立 B-tree 索引
- PostgreSQL B-tree 索引行大小限制为约 2704 字节（页面大小的 1/3）

## 修复方案

已创建迁移文件：`supabase/migrations/20260713000000_fix_image_description_index.sql`

该迁移会：
1. 删除原有的全文索引
2. 创建新的���分索引（只索引前 500 个字符）
3. 保留查询性能，同时支持任意长度的文本

## 部署步骤

### 方案 1：使用 Supabase CLI（推荐）

```bash
# 1. 确保已登录 Supabase
supabase login

# 2. 链接到你的项目（如果还没链接）
supabase link --project-ref zbpbkyzisamleqspijnr

# 3. 推送迁移到远程数据库
supabase db push

# 4. 验证迁移是否成功
supabase db remote commit
```

### 方案 2：通过 Supabase Dashboard 手动执行

1. 访问 https://supabase.com/dashboard/project/zbpbkyzisamleqspijnr/sql/new
2. 复制 `supabase/migrations/20260713000000_fix_image_description_index.sql` 的内容
3. 粘贴到 SQL Editor
4. 点击 "Run" 执行

### 方案 3：使用快速修复脚本

```bash
# 直接运行修复脚本
./scripts/fix-image-index.sh
```

## 验证修复

修复后，测试生成图片功能：
1. 发送一个图片生成请求
2. 使用较长的描述文本（超过 2000 字符）
3. 确认不再出现 500 错误

## 技术细节

### 索引变更

**之前**：
```sql
CREATE INDEX idx_messages_image_description
  ON messages(image_description)
  WHERE image_description IS NOT NULL;
```

**之后**：
```sql
CREATE INDEX idx_messages_image_description
  ON messages(LEFT(image_description, 500))
  WHERE image_description IS NOT NULL;
```

### 影响范围

- ✅ 不影响数据存储（仍可存储任意长度的文本）
- ✅ 不影响大部分查询性能（前 500 字符通常足够区分）
- ⚠️ 如果需要对完整文本进行精确搜索，可能需要额外的全文搜索索引

### 其他优化选项

如果需要全文搜索功能，可以取消注释迁移文件中的 GIN 索引：

```sql
CREATE INDEX idx_messages_image_description_fts
  ON public.messages USING gin(to_tsvector('english', COALESCE(image_description, '')));
```

## 预防措施

为了避免未来出现类似问题，考虑：

1. **应用层验证**：在 `image-generation/index.ts` 中限制描述长度
2. **数据库约束**：添加 CHECK 约束限制字段长度
3. **监控**：添加日志记录超长描述的情况

## 相关文件

- 迁移文件：`supabase/migrations/20260713000000_fix_image_description_index.sql`
- Edge Function：`supabase/functions/image-generation/index.ts`
- 原始迁移：`supabase/migrations/20260629100000_add_image_description_fields.sql`
