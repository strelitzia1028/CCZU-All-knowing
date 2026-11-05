import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query, withTransaction } from '../db.js';
import { getCurrentUser, requireAdmin } from '../session.js';
import {
  buildLikePattern,
  normalizeSearchTerm,
  parseSearchFields,
} from '../search-query.js';

interface KnowledgeItemRow {
  [key: string]: unknown;
  id: string;
  review_status: string;
}

type KnowledgePeriod = 'today' | 'week' | 'month' | 'year' | 'all';

function normalizePeriod(value: unknown): KnowledgePeriod {
  return value === 'today' ||
    value === 'week' ||
    value === 'month' ||
    value === 'year'
    ? value
    : 'all';
}

function parseTagIds(value: unknown): string[] {
  return typeof value === 'string'
    ? [
        ...new Set(
          value
            .split(',')
            .map((id) => id.trim())
            .filter((id) => /^[a-zA-Z0-9-]{1,36}$/.test(id))
        ),
      ].slice(0, 20)
    : [];
}

function normalizeTagMode(value: unknown): 'or' | 'and' {
  return value === 'and' ? 'and' : 'or';
}

function normalizeSourceLevel(value: unknown): string {
  return value === 'official' ||
    value === 'admin_reviewed' ||
    value === 'user_share'
    ? value
    : 'all';
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

      const searchTerm = normalizeSearchTerm(request.query.search);
      const searchPattern = buildLikePattern(searchTerm);
      const searchFields = parseSearchFields(request.query.search_fields, [
        'title',
        'content',
      ] as const);
      const period = normalizePeriod(request.query.period);
      const tagIds = parseTagIds(request.query.tag_ids);
      const tagMode = normalizeTagMode(request.query.tag_mode);
      const sourceLevel = normalizeSourceLevel(request.query.source_level);
      const rows = await query<KnowledgeItemRow>(
        `SELECT
           ki.*,
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
         WHERE ($1 = 'admin' OR ki.review_status = 'approved')
           AND (
             $2::text = ''
             OR ${searchFields.has('title') ? `ki.title ILIKE $3 ESCAPE '\\'` : 'FALSE'}
             OR ${searchFields.has('content') ? `ki.content ILIKE $3 ESCAPE '\\'` : 'FALSE'}
           )
           AND (
             $4::text = 'all'
             OR (
               $4::text = 'today'
               AND ki.updated_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
             )
             OR (
               $4::text = 'week'
               AND ki.updated_at >= date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
             )
             OR (
               $4::text = 'month'
               AND ki.updated_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
             )
             OR (
               $4::text = 'year'
               AND ki.updated_at >= date_trunc('year', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
             )
           )
           AND (
             cardinality($5::varchar[]) = 0
             OR (
               $6::text = 'or'
               AND EXISTS (
                 SELECT 1
                 FROM knowledge_item_tags kit_filter
                 WHERE kit_filter.knowledge_item_id = ki.id
                   AND kit_filter.tag_id = ANY($5::varchar[])
               )
             )
             OR (
               $6::text = 'and'
               AND (
                 SELECT count(DISTINCT kit_filter.tag_id)
                 FROM knowledge_item_tags kit_filter
                 WHERE kit_filter.knowledge_item_id = ki.id
                   AND kit_filter.tag_id = ANY($5::varchar[])
               ) = cardinality($5::varchar[])
             )
           )
           AND (
             $7::text = 'all'
             OR ki.source_level = $7
           )
         GROUP BY ki.id
         ORDER BY ki.updated_at DESC
         LIMIT 200`,
        [
          user.role,
          searchTerm,
          searchPattern,
          period,
          tagIds,
          tagMode,
          sourceLevel,
        ]
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
      const sourceType =
        typeof request.body?.source_type === 'string' &&
        request.body.source_type.trim()
          ? request.body.source_type.trim()
          : null;
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
      if (sourceType) {
        const typeRows = await query<{ value: string }>(
          `SELECT value
           FROM source_types
           WHERE value = $1 AND status = 'active'
           LIMIT 1`,
          [sourceType]
        );
        if (!typeRows[0]) {
          return response
            .status(400)
            .json({ error: '知识条目类型不存在或已停用' });
        }
      }

      const id = crypto.randomUUID();
      const item = await withTransaction(async (client) => {
        const result = await client.query<KnowledgeItemRow>(
          `INSERT INTO knowledge_items
             (id, title, content, source_type, source_level, review_status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            id,
            title,
            content,
            sourceType,
            sourceLevel,
            reviewStatus,
            admin.id,
          ]
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
        `SELECT *
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
      if (
        request.body?.source_type === null ||
        typeof request.body?.source_type === 'string'
      ) {
        const sourceType =
          typeof request.body.source_type === 'string' &&
          request.body.source_type.trim()
            ? request.body.source_type.trim()
            : null;
        if (sourceType) {
          const typeRows = await query<{ value: string }>(
            `SELECT value
             FROM source_types
             WHERE value = $1 AND status = 'active'
             LIMIT 1`,
            [sourceType]
          );
          if (!typeRows[0]) {
            return response
              .status(400)
              .json({ error: '知识条目类型不存在或已停用' });
          }
        }
        values.push(sourceType);
        assignments.push(`source_type = $${values.length}`);
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
