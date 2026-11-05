import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query } from '../db.js';
import { getCurrentUser, requireAdmin } from '../session.js';
import {
  suggestTagsFromAllowed,
  summarizeSourceContent,
} from '../llm.js';
import {
  buildLikePattern,
  normalizeSearchTerm,
  parseSearchFields,
} from '../search-query.js';

interface TagRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: Date | string;
}

export const tagsRouter = Router();

tagsRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const user = await getCurrentUser(request);
      if (!user) {
        return response
          .status(401)
          .json({ error: '未登录或会话已过期' });
      }

      const searchTerm = normalizeSearchTerm(request.query.search);
      const searchPattern = buildLikePattern(searchTerm);
      const searchFields = parseSearchFields(request.query.search_fields, [
        'name',
        'description',
      ] as const);
      const rows = await query<TagRow>(
        `SELECT id, name, description, status, created_at
         FROM tags
         WHERE ($1 = 'admin' OR status = 'active')
           AND (
             $2::text = ''
             OR ${searchFields.has('name') ? `name ILIKE $3 ESCAPE '\\'` : 'FALSE'}
             OR ${searchFields.has('description') ? `COALESCE(description, '') ILIKE $3 ESCAPE '\\'` : 'FALSE'}
           )
         ORDER BY
           CASE WHEN status = 'active' THEN 0 ELSE 1 END,
           created_at ASC
         LIMIT 100`,
        [user.role, searchTerm, searchPattern]
      );
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取标签失败');
    }
  })
);

tagsRouter.post(
  '/suggest',
  asyncRoute(async (request, response) => {
    try {
      const user = await getCurrentUser(request);
      if (!user) {
        return response
          .status(401)
          .json({ error: '未登录或会话已过期' });
      }

      const title =
        typeof request.body?.title === 'string'
          ? request.body.title.trim()
          : '';
      const content =
        typeof request.body?.content === 'string'
          ? request.body.content.trim()
          : '';
      const combined = [title, content].filter(Boolean).join('\n');
      if (combined.length < 1) {
        return response.json({ data: [] });
      }

      const activeTags = await query<TagRow>(
        `SELECT id, name, description, status, created_at
         FROM tags
         WHERE status = 'active'
         ORDER BY created_at ASC`
      );
      const sourceContent = combined.slice(0, 5000);
      const summary = await summarizeSourceContent(sourceContent);
      const suggestedNames = await suggestTagsFromAllowed(
        sourceContent,
        activeTags.map((tag) => ({
          name: tag.name,
          description: tag.description,
        }))
      );
      const normalizedNames = new Set(
        suggestedNames.map((name) => name.toLowerCase())
      );

      return response.json({
        summary,
        data: activeTags.filter((tag) =>
          normalizedNames.has(tag.name.toLowerCase())
        ),
      });
    } catch (error) {
      return sendApiError(response, error, 'AI 标签推荐失败');
    }
  })
);

tagsRouter.post(
  '/',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const name =
        typeof request.body?.name === 'string'
          ? request.body.name.trim()
          : '';
      const description =
        typeof request.body?.description === 'string'
          ? request.body.description.trim() || null
          : null;

      if (!name) {
        return response.status(400).json({ error: '标签名不能为空' });
      }

      const rows = await query<TagRow>(
        `INSERT INTO tags (id, name, description)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, status, created_at`,
        [crypto.randomUUID(), name, description]
      );
      return response.status(201).json({ data: rows[0] });
    } catch (error) {
      return sendApiError(response, error, '创建标签失败');
    }
  })
);

tagsRouter.patch(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const values: unknown[] = [];
      const assignments: string[] = [];

      if (
        typeof request.body?.name === 'string' &&
        request.body.name.trim()
      ) {
        values.push(request.body.name.trim());
        assignments.push(`name = $${values.length}`);
      }
      if (
        request.body?.description === null ||
        typeof request.body?.description === 'string'
      ) {
        const description =
          typeof request.body.description === 'string'
            ? request.body.description.trim() || null
            : null;
        values.push(description);
        assignments.push(`description = $${values.length}`);
      }
      if (
        request.body?.status === 'active' ||
        request.body?.status === 'disabled'
      ) {
        values.push(request.body.status);
        assignments.push(`status = $${values.length}`);
      }

      if (assignments.length === 0) {
        return response
          .status(400)
          .json({ error: '没有可更新的字段' });
      }

      values.push(request.params.id);
      const rows = await query<TagRow>(
        `UPDATE tags
         SET ${assignments.join(', ')}
         WHERE id = $${values.length}
         RETURNING id, name, description, status, created_at`,
        values
      );

      if (!rows[0]) {
        return response.status(404).json({ error: '标签不存在' });
      }
      return response.json({ data: rows[0] });
    } catch (error) {
      return sendApiError(response, error, '更新标签失败');
    }
  })
);

tagsRouter.delete(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const rows = await query<{ id: string }>(
        `DELETE FROM tags
         WHERE id = $1
         RETURNING id`,
        [request.params.id]
      );
      if (!rows[0]) {
        return response.status(404).json({ error: '标签不存在' });
      }
      return response.json({ success: true });
    } catch (error) {
      return sendApiError(response, error, '删除标签失败');
    }
  })
);
