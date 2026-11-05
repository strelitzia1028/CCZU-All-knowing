import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query } from '../db.js';
import { getCurrentUser, requireAdmin } from '../session.js';
import {
  suggestSourceType,
  summarizeSourceContent,
} from '../llm.js';

interface SourceTypeRow {
  id: string;
  value: string;
  label: string;
  description: string | null;
  status: string;
  created_at: Date | string;
}

export const sourceTypesRouter = Router();

sourceTypesRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const user = await getCurrentUser(request);
      if (!user) {
        return response
          .status(401)
          .json({ error: '未登录或会话已过期' });
      }

      const rows = await query<SourceTypeRow>(
        `SELECT id, value, label, description, status, created_at
         FROM source_types
         WHERE $1 = 'admin' OR status = 'active'
         ORDER BY
           CASE WHEN status = 'active' THEN 0 ELSE 1 END,
           created_at ASC
         LIMIT 100`,
        [user.role]
      );
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取信息源类型失败');
    }
  })
);

sourceTypesRouter.post(
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
      if (!combined) {
        return response.json({ data: null });
      }

      const activeTypes = await query<SourceTypeRow>(
        `SELECT id, value, label, description, status, created_at
         FROM source_types
         WHERE status = 'active'
         ORDER BY created_at ASC`
      );
      const sourceContent = combined.slice(0, 5000);
      const summary = await summarizeSourceContent(sourceContent);
      const suggestedValue = await suggestSourceType(
        sourceContent,
        activeTypes.map((item) => ({
          value: item.value,
          label: item.label,
          description: item.description,
        }))
      );
      return response.json({
        summary,
        data:
          activeTypes.find((item) => item.value === suggestedValue) || null,
      });
    } catch (error) {
      return sendApiError(response, error, 'AI 类型推荐失败');
    }
  })
);

sourceTypesRouter.post(
  '/',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const value =
        typeof request.body?.value === 'string'
          ? request.body.value.trim().toLowerCase()
          : '';
      const label =
        typeof request.body?.label === 'string'
          ? request.body.label.trim()
          : '';
      const description =
        typeof request.body?.description === 'string'
          ? request.body.description.trim() || null
          : null;

      if (!/^[a-z][a-z0-9_]{1,49}$/.test(value)) {
        return response.status(400).json({
          error: '类型代码需为 2-50 位小写字母、数字或下划线，并以字母开头',
        });
      }
      if (!label) {
        return response.status(400).json({ error: '类型名称不能为空' });
      }

      const rows = await query<SourceTypeRow>(
        `INSERT INTO source_types
           (id, value, label, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, value, label, description, status, created_at`,
        [crypto.randomUUID(), value, label, description]
      );
      return response.status(201).json({ data: rows[0] });
    } catch (error) {
      return sendApiError(response, error, '创建信息源类型失败');
    }
  })
);

sourceTypesRouter.patch(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const values: unknown[] = [];
      const assignments: string[] = [];

      if (
        typeof request.body?.label === 'string' &&
        request.body.label.trim()
      ) {
        values.push(request.body.label.trim());
        assignments.push(`label = $${values.length}`);
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

      values.push(String(request.params.id));
      const rows = await query<SourceTypeRow>(
        `UPDATE source_types
         SET ${assignments.join(', ')}
         WHERE id = $${values.length}
         RETURNING id, value, label, description, status, created_at`,
        values
      );
      if (!rows[0]) {
        return response
          .status(404)
          .json({ error: '信息源类型不存在' });
      }
      return response.json({ data: rows[0] });
    } catch (error) {
      return sendApiError(response, error, '更新信息源类型失败');
    }
  })
);

sourceTypesRouter.delete(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const id = String(request.params.id);
      const existing = await query<SourceTypeRow>(
        `SELECT id, value, label, description, status, created_at
         FROM source_types
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      const sourceType = existing[0];
      if (!sourceType) {
        return response
          .status(404)
          .json({ error: '信息源类型不存在' });
      }
      if (sourceType.status !== 'disabled') {
        return response
          .status(400)
          .json({ error: '请先停用类型，再执行永久删除' });
      }

      const references = await query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM sources
         WHERE type = $1`,
        [sourceType.value]
      );
      if (Number(references[0]?.count || 0) > 0) {
        return response.status(409).json({
          error: '已有信息源使用该类型，只能停用，不能删除',
        });
      }

      await query(`DELETE FROM source_types WHERE id = $1`, [id]);
      return response.json({ success: true });
    } catch (error) {
      return sendApiError(response, error, '删除信息源类型失败');
    }
  })
);
