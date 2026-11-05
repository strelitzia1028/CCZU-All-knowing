import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query } from '../db.js';
import { requireUser } from '../session.js';
import {
  buildLikePattern,
  normalizeSearchTerm,
  parseSearchFields,
} from '../search-query.js';

type InteractionKind = 'comment' | 'private_message';

interface NotificationRow {
  id: string;
  kind: InteractionKind;
  source_id: string;
  content: string;
  created_at: string | Date;
  read_at: string | Date | null;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  source_title: string;
  source_excerpt: string;
  source_type_label: string;
  source_status: string;
  source_owner_id: string;
  source_owner_name: string;
  source_owner_role: string;
  allow_discussion: boolean;
}

async function unreadCountFor(userId: string): Promise<number> {
  const rows = await query<{ unread_count: string | number }>(
    `SELECT (
       (
         SELECT count(*)
         FROM source_comments sc
         JOIN sources s ON s.id = sc.source_id
         WHERE s.created_by = $1
           AND sc.author_id <> $1
           AND sc.read_at IS NULL
       ) + (
         SELECT count(*)
         FROM direct_messages dm
         WHERE dm.recipient_id = $1
           AND dm.read_at IS NULL
       )
     ) AS unread_count`,
    [userId]
  );
  return Number(rows[0]?.unread_count || 0);
}

export const interactionsRouter = Router();

interactionsRouter.get(
  '/unread-count',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      return response.json({
        unread_count: await unreadCountFor(user.id),
      });
    } catch (error) {
      return sendApiError(response, error, '获取未读消息数量失败');
    }
  })
);

interactionsRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const searchTerm = normalizeSearchTerm(request.query.search);
      const searchPattern = buildLikePattern(searchTerm);
      const searchFields = parseSearchFields(request.query.search_fields, [
        'title',
        'content',
      ] as const);
      const rows = await query<NotificationRow>(
        `WITH notifications AS (
           SELECT
             sc.id,
             'comment'::text AS kind,
             sc.source_id,
             sc.content,
             sc.created_at,
             sc.read_at,
             sc.author_id AS actor_id
           FROM source_comments sc
           JOIN sources s ON s.id = sc.source_id
           WHERE s.created_by = $1
             AND sc.author_id <> $1

           UNION ALL

           SELECT
             dm.id,
             'private_message'::text AS kind,
             dm.source_id,
             dm.content,
             dm.created_at,
             dm.read_at,
             dm.sender_id AS actor_id
           FROM direct_messages dm
           WHERE dm.recipient_id = $1
         )
         SELECT
           n.id,
           n.kind,
           n.source_id,
           n.content,
           n.created_at,
           n.read_at,
           n.actor_id,
           actor.display_name AS actor_name,
           actor.role AS actor_role,
           s.title AS source_title,
           LEFT(regexp_replace(s.content, '\\s+', ' ', 'g'), 180) AS source_excerpt,
           COALESCE(st.label, s.type) AS source_type_label,
           s.status AS source_status,
           s.created_by AS source_owner_id,
           owner.display_name AS source_owner_name,
           owner.role AS source_owner_role,
           s.allow_discussion
         FROM notifications n
         JOIN sources s ON s.id = n.source_id
         JOIN profiles actor ON actor.id = n.actor_id
         JOIN profiles owner ON owner.id = s.created_by
         LEFT JOIN source_types st ON st.value = s.type
         WHERE (
           $2::text = ''
           OR ${searchFields.has('title') ? `s.title ILIKE $3 ESCAPE '\\'` : 'FALSE'}
           OR ${searchFields.has('content') ? `n.content ILIKE $3 ESCAPE '\\'` : 'FALSE'}
         )
         ORDER BY n.created_at DESC
         LIMIT 100`,
        [user.id, searchTerm, searchPattern]
      );

      return response.json({
        data: rows,
        unread_count: await unreadCountFor(user.id),
      });
    } catch (error) {
      return sendApiError(response, error, '获取互动消息失败');
    }
  })
);

interactionsRouter.patch(
  '/read-all',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      await query(
        `UPDATE source_comments sc
         SET read_at = NOW()
         FROM sources s
         WHERE sc.source_id = s.id
           AND s.created_by = $1
           AND sc.author_id <> $1
           AND sc.read_at IS NULL`,
        [user.id]
      );
      await query(
        `UPDATE direct_messages
         SET read_at = NOW()
         WHERE recipient_id = $1
           AND read_at IS NULL`,
        [user.id]
      );
      return response.json({
        success: true,
        unread_count: 0,
      });
    } catch (error) {
      return sendApiError(response, error, '标记全部消息已读失败');
    }
  })
);

interactionsRouter.patch(
  '/:kind/:id/read',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const kind = request.params.kind;
      const id = String(request.params.id);

      if (kind !== 'comment' && kind !== 'private_message') {
        return response.status(400).json({ error: '消息类型无效' });
      }

      const rows =
        kind === 'comment'
          ? await query<{ id: string }>(
              `UPDATE source_comments sc
               SET read_at = COALESCE(sc.read_at, NOW())
               FROM sources s
               WHERE sc.id = $2
                 AND sc.source_id = s.id
                 AND s.created_by = $1
                 AND sc.author_id <> $1
               RETURNING sc.id`,
              [user.id, id]
            )
          : await query<{ id: string }>(
              `UPDATE direct_messages
               SET read_at = COALESCE(read_at, NOW())
               WHERE id = $2
                 AND recipient_id = $1
               RETURNING id`,
              [user.id, id]
            );

      if (!rows[0]) {
        return response.status(404).json({ error: '消息不存在' });
      }
      return response.json({
        success: true,
        unread_count: await unreadCountFor(user.id),
      });
    } catch (error) {
      return sendApiError(response, error, '标记消息已读失败');
    }
  })
);
