import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query, withTransaction } from '../db.js';
import { requireAdmin } from '../session.js';

interface SourceRow {
  [key: string]: unknown;
  id: string;
  status: string;
}

export const reviewRouter = Router();

reviewRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const rows = await query<SourceRow>(
        `SELECT
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
         WHERE s.status = 'pending'
         GROUP BY s.id, p.id
         ORDER BY s.created_at DESC
         LIMIT 100`
      );
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取审核列表失败');
    }
  })
);

reviewRouter.patch(
  '/:id',
  asyncRoute(async (request, response) => {
    try {
      const admin = await requireAdmin(request);
      const status = request.body?.status;
      const rejectReason =
        typeof request.body?.reject_reason === 'string'
          ? request.body.reject_reason.trim()
          : null;

      if (status !== 'approved' && status !== 'rejected') {
        return response.status(400).json({ error: '状态无效' });
      }
      if (status === 'rejected' && !rejectReason) {
        return response
          .status(400)
          .json({ error: '驳回时必须填写原因' });
      }

      const updated = await withTransaction(async (client) => {
        const result = await client.query<SourceRow>(
          `UPDATE sources
           SET status = $1,
               reject_reason = $2,
               updated_at = NOW()
           WHERE id = $3 AND status = 'pending'
           RETURNING *`,
          [
            status,
            status === 'rejected' ? rejectReason : null,
            request.params.id,
          ]
        );
        const source = result.rows[0];
        if (!source) return null;

        await client.query(
          `INSERT INTO audit_logs
             (id, actor_id, action, target_type, target_id, detail)
           VALUES ($1, $2, $3, 'source', $4, $5)`,
          [
            crypto.randomUUID(),
            admin.id,
            status === 'approved'
              ? 'approve_source'
              : 'reject_source',
            request.params.id,
            status === 'rejected'
              ? JSON.stringify({ reject_reason: rejectReason })
              : null,
          ]
        );
        return source;
      });

      if (!updated) {
        const existing = await query<{ id: string; status: string }>(
          `SELECT id, status
           FROM sources
           WHERE id = $1
           LIMIT 1`,
          [request.params.id]
        );
        if (!existing[0]) {
          return response
            .status(404)
            .json({ error: '信息源不存在' });
        }
        return response
          .status(400)
          .json({ error: '只能审核待审核的信息源' });
      }

      return response.json({ data: updated });
    } catch (error) {
      return sendApiError(response, error, '审核操作失败');
    }
  })
);
