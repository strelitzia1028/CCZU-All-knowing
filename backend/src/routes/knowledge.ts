import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query, withTransaction } from '../db.js';
import { getCurrentUser, requireAdmin } from '../session.js';

interface KnowledgeItemRow {
  [key: string]: unknown;
  id: string;
  review_status: string;
}

export const knowledgeRouter = Router();

knowledgeRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const user = await getCurrentUser(request);
      if (!user) {
        return response
          .status(401)
          .json({ error: '未登录或会话已过期' });
      }

      const rows = await query<KnowledgeItemRow>(
        `SELECT
           ki.*,
           (ki.content LIKE '【示例数据，需替换】%') AS is_demo,
           COALESCE(
             json_agg(
               json_build_object(
                 'tag_id', kit.tag_id,
                 'tags', json_build_object('id', t.id, 'name', t.name)
               )
               ORDER BY t.name
             ) FILTER (WHERE kit.tag_id IS NOT NULL),
             '[]'::json
           ) AS knowledge_item_tags
         FROM knowledge_items ki
         LEFT JOIN knowledge_item_tags kit ON kit.knowledge_item_id = ki.id
         LEFT JOIN tags t ON t.id = kit.tag_id
         WHERE $1 = 'admin' OR ki.review_status = 'approved'
         GROUP BY ki.id, ki.content
         ORDER BY ki.updated_at DESC
         LIMIT 200`,
        [user.role]
      );
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取知识库失败');
    }
  })
);

knowledgeRouter.post(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const admin = await requireAdmin(request);
      const title =
        typeof request.body?.title === 'string'
          ? request.body.title.trim()
          : '';
      const content =
        typeof request.body?.content === 'string'
          ? request.body.content.trim()
          : '';
      const sourceLevel =
        typeof request.body?.source_level === 'string'
          ? request.body.source_level
          : 'user_share';
      const reviewStatus =
        typeof request.body?.review_status === 'string'
          ? request.body.review_status
          : 'approved';
      const tagIds = Array.isArray(request.body?.tag_ids)
        ? request.body.tag_ids.filter(
            (id: unknown): id is string => typeof id === 'string'
          )
        : [];

      if (!title || !content) {
        return response
          .status(400)
          .json({ error: '标题和内容不能为空' });
      }

      const id = crypto.randomUUID();
      const item = await withTransaction(async (client) => {
        const result = await client.query<KnowledgeItemRow>(
          `INSERT INTO knowledge_items
             (id, title, content, source_level, review_status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [id, title, content, sourceLevel, reviewStatus, admin.id]
        );

        if (tagIds.length > 0) {
          await client.query(
            `INSERT INTO knowledge_item_tags (knowledge_item_id, tag_id)
             SELECT $1, UNNEST($2::varchar[])`,
            [id, tagIds]
          );
        }
        return result.rows[0];
      });

      return response.status(201).json({ data: item });
    } catch (error) {
      return sendApiError(response, error, '创建知识库条目失败');
    }
  })
);

knowledgeRouter.get(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      const user = await getCurrentUser(request);
      if (!user) {
        return response
          .status(401)
          .json({ error: '未登录或会话已过期' });
      }

      const rows = await query<KnowledgeItemRow>(
        `SELECT *,
                (content LIKE '【示例数据，需替换】%') AS is_demo
         FROM knowledge_items
         WHERE id = $1
         LIMIT 1`,
        [request.params.id]
      );
      const item = rows[0];

      if (!item) {
        return response
          .status(404)
          .json({ error: '知识库条目不存在' });
      }
      if (user.role !== 'admin' && item.review_status !== 'approved') {
        return response.status(403).json({ error: '无权查看此条目' });
      }
      return response.json({ data: item });
    } catch (error) {
      return sendApiError(response, error, '获取知识库条目失败');
    }
  })
);

knowledgeRouter.patch(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const values: unknown[] = [];
      const assignments: string[] = [];

      if (
        typeof request.body?.title === 'string' &&
        request.body.title.trim()
      ) {
        values.push(request.body.title.trim());
        assignments.push(`title = $${values.length}`);
      }
      if (
        typeof request.body?.content === 'string' &&
        request.body.content.trim()
      ) {
        values.push(request.body.content.trim());
        assignments.push(`content = $${values.length}`);
      }
      if (typeof request.body?.source_level === 'string') {
        values.push(request.body.source_level);
        assignments.push(`source_level = $${values.length}`);
      }
      if (typeof request.body?.review_status === 'string') {
        values.push(request.body.review_status);
        assignments.push(`review_status = $${values.length}`);
      }

      const tagIds = Array.isArray(request.body?.tag_ids)
        ? request.body.tag_ids.filter(
            (value: unknown): value is string =>
              typeof value === 'string'
          )
        : null;

      if (assignments.length === 0 && tagIds === null) {
        return response
          .status(400)
          .json({ error: '没有可更新的字段' });
      }

      values.push(request.params.id);
      const idParameter = `$${values.length}`;
      const updated = await withTransaction(async (client) => {
        const result = await client.query<KnowledgeItemRow>(
          `UPDATE knowledge_items
           SET ${[...assignments, 'updated_at = NOW()'].join(', ')}
           WHERE id = ${idParameter}
           RETURNING *`,
          values
        );
        const item = result.rows[0];
        if (!item) return null;

        if (tagIds !== null) {
          await client.query(
            `DELETE FROM knowledge_item_tags
             WHERE knowledge_item_id = $1`,
            [request.params.id]
          );
          if (tagIds.length > 0) {
            await client.query(
              `INSERT INTO knowledge_item_tags
                 (knowledge_item_id, tag_id)
               SELECT $1, UNNEST($2::varchar[])`,
              [request.params.id, tagIds]
            );
          }
        }
        return item;
      });

      if (!updated) {
        return response
          .status(404)
          .json({ error: '知识库条目不存在' });
      }
      return response.json({ data: updated });
    } catch (error) {
      return sendApiError(response, error, '更新知识库条目失败');
    }
  })
);

knowledgeRouter.delete(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const rows = await query<{ id: string }>(
        `DELETE FROM knowledge_items
         WHERE id = $1
         RETURNING id`,
        [request.params.id]
      );
      if (!rows[0]) {
        return response
          .status(404)
          .json({ error: '知识库条目不存在' });
      }
      return response.json({ success: true });
    } catch (error) {
      return sendApiError(response, error, '删除知识库条目失败');
    }
  })
);
