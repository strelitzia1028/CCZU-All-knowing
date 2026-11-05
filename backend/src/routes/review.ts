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
  '/catalog-requests',
  asyncRoute(async (request, response) => {
    try {
      await requireAdmin(request);
      const rows = await query<Record<string, unknown>>(
        `SELECT
           cr.*,
           json_build_object(
             'display_name', p.display_name
           ) AS requested_by_profile
         FROM catalog_requests cr
         LEFT JOIN profiles p ON p.id = cr.requested_by
         WHERE cr.status = 'pending'
         ORDER BY cr.created_at DESC
         LIMIT 100`
      );
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取目录申请失败');
    }
  })
);

reviewRouter.patch(
  '/catalog-requests/:id',
  asyncRoute(async (request, response) => {
    try {
      const admin = await requireAdmin(request);
      const status = request.body?.status;
      const reviewNote =
        typeof request.body?.review_note === 'string'
          ? request.body.review_note.trim()
          : null;

      if (status !== 'approved' && status !== 'rejected') {
        return response.status(400).json({ error: '审核状态无效' });
      }

      const result = await withTransaction(async (client) => {
        const requestRows = await client.query<{
          id: string;
          request_type: 'tag' | 'source_type';
          name: string;
          code: string | null;
          description: string | null;
          status: string;
        }>(
          `SELECT id, request_type, name, code, description, status
           FROM catalog_requests
           WHERE id = $1
           FOR UPDATE`,
          [request.params.id]
        );
        const catalogRequest = requestRows.rows[0];
        if (!catalogRequest) return { error: 'not_found' as const };
        if (catalogRequest.status !== 'pending') {
          return { error: 'already_reviewed' as const };
        }

        let targetId: string | null = null;
        if (status === 'approved') {
          if (catalogRequest.request_type === 'tag') {
            const tagRows = await client.query<{ id: string }>(
              `INSERT INTO tags (id, name, description, status)
               VALUES ($1, $2, $3, 'active')
               ON CONFLICT (name) DO UPDATE
               SET description = COALESCE(EXCLUDED.description, tags.description),
                   status = 'active'
               RETURNING id`,
              [
                crypto.randomUUID(),
                catalogRequest.name,
                catalogRequest.description,
              ]
            );
            targetId = tagRows.rows[0]?.id || null;
          } else {
            if (!catalogRequest.code) {
              return { error: 'missing_code' as const };
            }
            const typeRows = await client.query<{ id: string }>(
              `INSERT INTO source_types
                 (id, value, label, description, status)
               VALUES ($1, $2, $3, $4, 'active')
               ON CONFLICT (value) DO UPDATE
               SET label = EXCLUDED.label,
                   description = COALESCE(EXCLUDED.description, source_types.description),
                   status = 'active'
               RETURNING id`,
              [
                crypto.randomUUID(),
                catalogRequest.code,
                catalogRequest.name,
                catalogRequest.description,
              ]
            );
            targetId = typeRows.rows[0]?.id || null;
          }
        }

        const updated = await client.query<Record<string, unknown>>(
          `UPDATE catalog_requests
           SET status = $1,
               reviewed_by = $2,
               review_note = $3,
               target_id = $4,
               updated_at = NOW()
           WHERE id = $5
           RETURNING *`,
          [
            status,
            admin.id,
            reviewNote,
            targetId,
            request.params.id,
          ]
        );
        await client.query(
          `INSERT INTO audit_logs
             (id, actor_id, action, target_type, target_id, detail)
           VALUES ($1, $2, $3, 'catalog_request', $4, $5)`,
          [
            crypto.randomUUID(),
            admin.id,
            status === 'approved'
              ? 'approve_catalog_request'
              : 'reject_catalog_request',
            request.params.id,
            JSON.stringify({
              request_type: catalogRequest.request_type,
              name: catalogRequest.name,
              target_id: targetId,
            }),
          ]
        );
        return { data: updated.rows[0] };
      });

      if ('error' in result) {
        if (result.error === 'not_found') {
          return response.status(404).json({ error: '目录申请不存在' });
        }
        if (result.error === 'missing_code') {
          return response
            .status(400)
            .json({ error: '类型申请缺少类型代码' });
        }
        return response
          .status(400)
          .json({ error: '该申请已经审核' });
      }
      return response.json({ data: result.data });
    } catch (error) {
      return sendApiError(response, error, '审核目录申请失败');
    }
  })
);

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
