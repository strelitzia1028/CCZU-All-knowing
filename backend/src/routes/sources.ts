import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query, withTransaction } from '../db.js';
import { requireUser } from '../session.js';

interface SourceRow {
  [key: string]: unknown;
  id: string;
  created_by: string;
  status: string;
}

const SOURCE_LIST_QUERY = `
  SELECT
    s.*,
    CASE
      WHEN p.id IS NULL THEN NULL
      ELSE json_build_object('display_name', p.display_name)
    END AS profiles,
    COALESCE(
      json_agg(
        json_build_object(
          'tag_id', st.tag_id,
          'tags', json_build_object('id', t.id, 'name', t.name)
        )
        ORDER BY t.name
      ) FILTER (WHERE st.tag_id IS NOT NULL),
      '[]'::json
    ) AS source_tags
  FROM sources s
  LEFT JOIN profiles p ON p.id = s.created_by
  LEFT JOIN source_tags st ON st.source_id = s.id
  LEFT JOIN tags t ON t.id = st.tag_id
  WHERE $1 = 'admin' OR s.status = 'approved' OR s.created_by = $2
  GROUP BY s.id, p.id
  ORDER BY s.created_at DESC
  LIMIT 100`;

async function getSource(id: string): Promise<SourceRow | null> {
  const rows = await query<SourceRow>(
    `SELECT *
     FROM sources
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export const sourcesRouter = Router();

sourcesRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const rows = await query<SourceRow>(SOURCE_LIST_QUERY, [
        user.role,
        user.id,
      ]);
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取信息源失败');
    }
  })
);

sourcesRouter.post(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const title =
        typeof request.body?.title === 'string'
          ? request.body.title.trim()
          : '';
      const content =
        typeof request.body?.content === 'string'
          ? request.body.content.trim()
          : '';
      const type =
        typeof request.body?.type === 'string' ? request.body.type : '';
      const tagIds = Array.isArray(request.body?.tag_ids)
        ? request.body.tag_ids.filter(
            (id: unknown): id is string => typeof id === 'string'
          )
        : [];

      if (!title || !content || !type) {
        return response
          .status(400)
          .json({ error: '标题、内容和类型不能为空' });
      }

      const id = crypto.randomUUID();
      const source = await withTransaction(async (client) => {
        const result = await client.query<SourceRow>(
          `INSERT INTO sources
             (id, title, content, type, contact_mode, contact_value,
              valid_until, location, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
           RETURNING *`,
          [
            id,
            title,
            content,
            type,
            request.body.contact_mode || 'platform',
            request.body.contact_value || null,
            request.body.valid_until || null,
            request.body.location || null,
            user.id,
          ]
        );

        if (tagIds.length > 0) {
          await client.query(
            `INSERT INTO source_tags (source_id, tag_id)
             SELECT $1, UNNEST($2::varchar[])`,
            [id, tagIds]
          );
        }
        return result.rows[0];
      });

      return response.status(201).json({ data: source });
    } catch (error) {
      return sendApiError(response, error, '创建信息源失败');
    }
  })
);

sourcesRouter.get(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const source = await getSource(String(request.params.id));
      if (!source) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (
        source.status !== 'approved' &&
        source.created_by !== user.id &&
        user.role !== 'admin'
      ) {
        return response.status(403).json({ error: '无权查看此信息源' });
      }
      return response.json({ data: source });
    } catch (error) {
      return sendApiError(response, error, '获取信息源失败');
    }
  })
);

sourcesRouter.patch(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const existing = await getSource(String(request.params.id));

      if (!existing) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (existing.created_by !== user.id && user.role !== 'admin') {
        return response.status(403).json({ error: '无权修改此信息源' });
      }
      if (existing.status === 'approved' || existing.status === 'pending') {
        return response
          .status(400)
          .json({ error: '已审核或审核中的信息源不可编辑' });
      }

      const values: unknown[] = [];
      const assignments: string[] = [];
      const addAssignment = (column: string, value: unknown) => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };

      if (
        typeof request.body?.title === 'string' &&
        request.body.title.trim()
      ) {
        addAssignment('title', request.body.title.trim());
      }
      if (
        typeof request.body?.content === 'string' &&
        request.body.content.trim()
      ) {
        addAssignment('content', request.body.content.trim());
      }
      if (typeof request.body?.type === 'string') {
        addAssignment('type', request.body.type);
      }
      if (typeof request.body?.contact_mode === 'string') {
        addAssignment('contact_mode', request.body.contact_mode);
      }
      if (
        request.body?.contact_value === null ||
        typeof request.body?.contact_value === 'string'
      ) {
        addAssignment('contact_value', request.body.contact_value || null);
      }
      if (
        request.body?.valid_until === null ||
        typeof request.body?.valid_until === 'string'
      ) {
        addAssignment('valid_until', request.body.valid_until || null);
      }
      if (
        request.body?.location === null ||
        typeof request.body?.location === 'string'
      ) {
        addAssignment('location', request.body.location || null);
      }
      if (request.body?.status === 'pending') {
        addAssignment('status', 'pending');
        addAssignment('reject_reason', null);
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
        const result = await client.query<SourceRow>(
          `UPDATE sources
           SET ${[...assignments, 'updated_at = NOW()'].join(', ')}
           WHERE id = ${idParameter}
           RETURNING *`,
          values
        );
        const source = result.rows[0];
        if (!source) return null;

        if (tagIds !== null) {
          await client.query(
            `DELETE FROM source_tags WHERE source_id = $1`,
            [request.params.id]
          );
          if (tagIds.length > 0) {
            await client.query(
              `INSERT INTO source_tags (source_id, tag_id)
               SELECT $1, UNNEST($2::varchar[])`,
              [request.params.id, tagIds]
            );
          }
        }
        return source;
      });

      if (!updated) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      return response.json({ data: updated });
    } catch (error) {
      return sendApiError(response, error, '更新信息源失败');
    }
  })
);

sourcesRouter.delete(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const existing = await getSource(String(request.params.id));
      if (!existing) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (existing.created_by !== user.id && user.role !== 'admin') {
        return response.status(403).json({ error: '无权删除此信息源' });
      }

      await query(`DELETE FROM sources WHERE id = $1`, [
        request.params.id,
      ]);
      return response.json({ success: true });
    } catch (error) {
      return sendApiError(response, error, '删除信息源失败');
    }
  })
);
