import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query, withTransaction } from '../db.js';
import { requireAdmin, requireUser } from '../session.js';

interface SourceRow {
  [key: string]: unknown;
  id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  created_by: string;
}

const SOURCE_PERIOD_SQL = `
  (
    $3::text = 'all'
    OR (
      $3::text = 'today'
      AND s.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
    )
    OR (
      $3::text = 'week'
      AND s.created_at >= date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
    )
    OR (
      $3::text = 'month'
      AND s.created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
    )
    OR (
      $3::text = 'year'
      AND s.created_at >= date_trunc('year', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
    )
  )`;

const CONTACT_VALUE_SQL = `
  CASE
    WHEN s.contact_mode = 'public'
      OR s.created_by = $2
      OR $5::text = 'admin'
    THEN s.contact_value
    ELSE NULL
  END AS contact_value`;

const SOURCE_TAG_AGGREGATE = `
  COALESCE(
    json_agg(
      json_build_object(
        'tag_id', st.tag_id,
        'tags', json_build_object('id', t.id, 'name', t.name)
      )
      ORDER BY t.name
    ) FILTER (WHERE st.tag_id IS NOT NULL),
    '[]'::json
  ) AS source_tags`;

function normalizePeriod(value: unknown): string {
  return value === 'today' ||
    value === 'week' ||
    value === 'month' ||
    value === 'year'
    ? value
    : 'all';
}

function parseTagIds(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      rawValues
        .flatMap((entry) =>
          typeof entry === 'string' ? entry.split(',') : []
        )
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry.length <= 36)
    ),
  ].slice(0, 20);
}

async function getRawSource(id: string): Promise<SourceRow | null> {
  const rows = await query<SourceRow>(
    `SELECT *
     FROM sources
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getSourceWithRelations(
  id: string,
  userId: string,
  userRole: string
): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT
       s.id,
       s.title,
       s.content,
       s.type,
       s.contact_mode,
       CASE
         WHEN s.contact_mode = 'public'
           OR s.created_by = $2
           OR $3::text = 'admin'
         THEN s.contact_value
         ELSE NULL
       END AS contact_value,
       s.valid_until,
       s.location,
       s.status,
       s.reject_reason,
       s.created_by,
       s.created_at,
       s.updated_at,
       CASE
         WHEN p.id IS NULL THEN NULL
         ELSE json_build_object('display_name', p.display_name)
       END AS profiles,
       ${SOURCE_TAG_AGGREGATE},
       ki.id AS knowledge_item_id
     FROM sources s
     LEFT JOIN profiles p ON p.id = s.created_by
     LEFT JOIN source_tags st ON st.source_id = s.id
     LEFT JOIN tags t ON t.id = st.tag_id
     LEFT JOIN knowledge_items ki ON ki.source_id = s.id
     WHERE s.id = $1
     GROUP BY s.id, p.id, ki.id
     LIMIT 1`,
    [id, userId, userRole]
  );
  return rows[0] || null;
}

export const sourcesRouter = Router();

sourcesRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const requestedFilter =
        typeof request.query.status === 'string'
          ? request.query.status
          : '';
      const filter = requestedFilter === 'mine' ? 'mine' : 'all';
      const period = normalizePeriod(request.query.period);
      const tagIds = parseTagIds(request.query.tag_ids);

      const rows = await query<Record<string, unknown>>(
        `SELECT
           s.id,
           s.title,
           s.content,
           s.type,
           s.contact_mode,
           ${CONTACT_VALUE_SQL},
           s.valid_until,
           s.location,
           s.status,
           s.reject_reason,
           s.created_by,
           s.created_at,
           s.updated_at,
           CASE
             WHEN p.id IS NULL THEN NULL
             ELSE json_build_object('display_name', p.display_name)
           END AS profiles,
           ${SOURCE_TAG_AGGREGATE},
           ki.id AS knowledge_item_id
         FROM sources s
         LEFT JOIN profiles p ON p.id = s.created_by
         LEFT JOIN source_tags st ON st.source_id = s.id
         LEFT JOIN tags t ON t.id = st.tag_id
         LEFT JOIN knowledge_items ki ON ki.source_id = s.id
         WHERE (
           ($1 = 'mine' AND s.created_by = $2)
           OR (
             $1 = 'all'
             AND (s.status = 'approved' OR s.created_by = $2)
           )
         )
         AND ${SOURCE_PERIOD_SQL}
         AND (
           cardinality($4::varchar[]) = 0
           OR EXISTS (
             SELECT 1
             FROM source_tags st2
             WHERE st2.source_id = s.id
               AND st2.tag_id = ANY($4::varchar[])
           )
         )
         GROUP BY s.id, p.id, ki.id
         ORDER BY s.created_at DESC
         LIMIT 200`,
        [filter, user.id, period, tagIds, user.role]
      );
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
        typeof request.body?.type === 'string'
          ? request.body.type.trim()
          : '';
      const tagIds = Array.isArray(request.body?.tag_ids)
        ? [
            ...new Set(
              request.body.tag_ids.filter(
                (id: unknown): id is string => typeof id === 'string'
              )
            ),
          ]
        : [];

      if (!title || !content || !type) {
        return response
          .status(400)
          .json({ error: '标题、内容和类型不能为空' });
      }

      const typeRows = await query<{ value: string }>(
        `SELECT value
         FROM source_types
         WHERE value = $1 AND status = 'active'
         LIMIT 1`,
        [type]
      );
      if (!typeRows[0]) {
        return response
          .status(400)
          .json({ error: '信息源类型不存在或已停用' });
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
            request.body.contact_mode === 'public' ||
            request.body.contact_mode === 'masked'
              ? request.body.contact_mode
              : 'platform',
            typeof request.body.contact_value === 'string'
              ? request.body.contact_value.trim() || null
              : null,
            typeof request.body.valid_until === 'string'
              ? request.body.valid_until || null
              : null,
            typeof request.body.location === 'string'
              ? request.body.location.trim() || null
              : null,
            user.id,
          ]
        );

        if (tagIds.length > 0) {
          await client.query(
            `INSERT INTO source_tags (source_id, tag_id)
             SELECT $1, UNNEST($2::varchar[])
             ON CONFLICT (source_id, tag_id) DO NOTHING`,
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

sourcesRouter.post(
  '/:id/promote',
  asyncRoute(async (request, response) => {
    try {
      const admin = await requireAdmin(request);
      const sourceId = String(request.params.id);
      const source = await getRawSource(sourceId);

      if (!source) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (source.status !== 'approved') {
        return response
          .status(400)
          .json({ error: '只有审核通过的信息源才能转存知识库' });
      }

      const existing = await query<Record<string, unknown>>(
        `SELECT *
         FROM knowledge_items
         WHERE source_id = $1
         LIMIT 1`,
        [sourceId]
      );
      if (existing[0]) {
        return response.json({
          data: existing[0],
          already_promoted: true,
        });
      }

      const knowledgeId = crypto.randomUUID();
      const item = await withTransaction(async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `INSERT INTO knowledge_items
             (id, title, content, source_level, review_status, created_by, source_id)
           VALUES ($1, $2, $3, 'admin_reviewed', 'approved', $4, $5)
           ON CONFLICT (source_id) DO NOTHING
           RETURNING *`,
          [
            knowledgeId,
            source.title,
            source.content,
            admin.id,
            sourceId,
          ]
        );

        if (!result.rows[0]) {
          const concurrent = await client.query<Record<string, unknown>>(
            `SELECT *
             FROM knowledge_items
             WHERE source_id = $1
             LIMIT 1`,
            [sourceId]
          );
          return {
            item: concurrent.rows[0] || null,
            created: false,
          };
        }

        await client.query(
          `INSERT INTO knowledge_item_tags (knowledge_item_id, tag_id)
           SELECT $1, tag_id
           FROM source_tags
           WHERE source_id = $2
           ON CONFLICT (knowledge_item_id, tag_id) DO NOTHING`,
          [knowledgeId, sourceId]
        );
        await client.query(
          `INSERT INTO audit_logs
             (id, actor_id, action, target_type, target_id, detail)
           VALUES ($1, $2, 'promote_source', 'source', $3, $4)`,
          [
            crypto.randomUUID(),
            admin.id,
            sourceId,
            JSON.stringify({ knowledge_item_id: knowledgeId }),
          ]
        );

        return { item: result.rows[0], created: true };
      });

      return response.status(item.created ? 201 : 200).json({
        data: item.item,
        already_promoted: !item.created,
      });
    } catch (error) {
      return sendApiError(response, error, '转存知识库失败');
    }
  })
);

sourcesRouter.get(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const source = await getSourceWithRelations(
        String(request.params.id),
        user.id,
        user.role
      );
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
      const existing = await getRawSource(String(request.params.id));

      if (!existing) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (existing.created_by !== user.id && user.role !== 'admin') {
        return response.status(403).json({ error: '无权修改此信息源' });
      }
      if (
        user.role !== 'admin' &&
        (existing.status === 'approved' || existing.status === 'pending')
      ) {
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
        addAssignment('type', request.body.type.trim());
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
        ? [
            ...new Set(
              request.body.tag_ids.filter(
                (value: unknown): value is string =>
                  typeof value === 'string'
              )
            ),
          ]
        : null;

      if (assignments.length === 0 && tagIds === null) {
        return response
          .status(400)
          .json({ error: '没有可更新的字段' });
      }

      values.push(request.params.id);
      const idParameter = `$${values.length}`;
      const updated = await withTransaction(async (client) => {
        let source: SourceRow | undefined;
        if (assignments.length > 0) {
          const result = await client.query<SourceRow>(
            `UPDATE sources
             SET ${[...assignments, 'updated_at = NOW()'].join(', ')}
             WHERE id = ${idParameter}
             RETURNING *`,
            values
          );
          source = result.rows[0];
        } else {
          const result = await client.query<SourceRow>(
            `UPDATE sources
             SET updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [request.params.id]
          );
          source = result.rows[0];
        }
        if (!source) return null;

        if (tagIds !== null) {
          await client.query(
            `DELETE FROM source_tags WHERE source_id = $1`,
            [request.params.id]
          );
          if (tagIds.length > 0) {
            await client.query(
              `INSERT INTO source_tags (source_id, tag_id)
               SELECT $1, UNNEST($2::varchar[])
               ON CONFLICT (source_id, tag_id) DO NOTHING`,
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
      const existing = await getRawSource(String(request.params.id));
      if (!existing) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (existing.created_by !== user.id && user.role !== 'admin') {
        return response.status(403).json({ error: '无权删除此信息源' });
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE knowledge_items
           SET source_id = NULL
           WHERE source_id = $1`,
          [request.params.id]
        );
        await client.query(`DELETE FROM sources WHERE id = $1`, [
          request.params.id,
        ]);
      });
      return response.json({ success: true });
    } catch (error) {
      return sendApiError(response, error, '删除信息源失败');
    }
  })
);
