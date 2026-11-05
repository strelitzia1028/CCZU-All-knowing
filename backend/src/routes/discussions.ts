import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { query } from '../db.js';
import { requireUser } from '../session.js';

interface DiscussionSource {
  id: string;
  title: string;
  status: string;
  created_by: string;
  allow_discussion: boolean;
}

async function getDiscussionSource(
  sourceId: string
): Promise<DiscussionSource | null> {
  const rows = await query<DiscussionSource>(
    `SELECT id, title, status, created_by, allow_discussion
     FROM sources
     WHERE id = $1
     LIMIT 1`,
    [sourceId]
  );
  return rows[0] || null;
}

export const discussionsRouter = Router();

discussionsRouter.get(
  '/sources/:id/comments',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const source = await getDiscussionSource(String(request.params.id));
      if (!source) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (
        source.status !== 'approved' &&
        source.created_by !== user.id &&
        user.role !== 'admin'
      ) {
        return response.status(403).json({ error: '无权查看此讨论' });
      }
      if (!source.allow_discussion) {
        return response
          .status(403)
          .json({ error: '作者未开放公开讨论' });
      }

      const rows = await query<Record<string, unknown>>(
        `SELECT
           sc.id,
           sc.content,
           sc.created_at,
           sc.author_id,
           p.display_name AS author_name,
           p.role AS author_role
         FROM source_comments sc
         JOIN profiles p ON p.id = sc.author_id
         WHERE sc.source_id = $1
         ORDER BY sc.created_at ASC
         LIMIT 300`,
        [request.params.id]
      );
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取讨论失败');
    }
  })
);

discussionsRouter.post(
  '/sources/:id/comments',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const source = await getDiscussionSource(String(request.params.id));
      const content =
        typeof request.body?.content === 'string'
          ? request.body.content.trim()
          : '';

      if (!source) {
        return response.status(404).json({ error: '信息源不存在' });
      }
      if (source.status !== 'approved') {
        return response
          .status(400)
          .json({ error: '信息源通过审核后才能公开讨论' });
      }
      if (!source.allow_discussion) {
        return response
          .status(403)
          .json({ error: '作者未开放公开讨论' });
      }
      if (!content || content.length > 2000) {
        return response
          .status(400)
          .json({ error: '讨论内容需为 1-2000 个字符' });
      }

      const rows = await query<Record<string, unknown>>(
        `INSERT INTO source_comments
           (id, source_id, author_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, source_id, author_id, content, created_at`,
        [crypto.randomUUID(), source.id, user.id, content]
      );
      return response.status(201).json({
        data: {
          ...rows[0],
          author_name: user.display_name,
          author_role: user.role,
        },
      });
    } catch (error) {
      return sendApiError(response, error, '发布讨论失败');
    }
  })
);

discussionsRouter.get(
  '/messages/thread',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const sourceId =
        typeof request.query.source_id === 'string'
          ? request.query.source_id
          : '';
      const peerId =
        typeof request.query.peer_id === 'string'
          ? request.query.peer_id
          : '';
      if (!sourceId || !peerId || peerId === user.id) {
        return response.status(400).json({ error: '私聊对象无效' });
      }

      const source = await getDiscussionSource(sourceId);
      if (!source || source.status !== 'approved') {
        return response.status(404).json({ error: '信息源不存在' });
      }
      const peer = await query<{ display_name: string; role: string }>(
        `SELECT display_name, role
         FROM profiles
         WHERE id = $1
         LIMIT 1`,
        [peerId]
      );
      if (!peer[0]) {
        return response.status(404).json({ error: '私聊用户不存在' });
      }

      const rows = await query<Record<string, unknown>>(
        `SELECT
           dm.id,
           dm.sender_id,
           dm.recipient_id,
           dm.content,
           dm.created_at,
           sender.display_name AS sender_name,
           sender.role AS sender_role
         FROM direct_messages dm
         JOIN profiles sender ON sender.id = dm.sender_id
         WHERE dm.source_id = $1
           AND (
             (dm.sender_id = $2 AND dm.recipient_id = $3)
             OR (dm.sender_id = $3 AND dm.recipient_id = $2)
           )
         ORDER BY dm.created_at ASC
         LIMIT 500`,
        [sourceId, user.id, peerId]
      );
      return response.json({
        data: rows,
        peer: {
          id: peerId,
          display_name: peer[0].display_name,
          role: peer[0].role,
        },
      });
    } catch (error) {
      return sendApiError(response, error, '获取私聊失败');
    }
  })
);

discussionsRouter.post(
  '/messages',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const sourceId =
        typeof request.body?.source_id === 'string'
          ? request.body.source_id
          : '';
      const recipientId =
        typeof request.body?.recipient_id === 'string'
          ? request.body.recipient_id
          : '';
      const content =
        typeof request.body?.content === 'string'
          ? request.body.content.trim()
          : '';

      if (!sourceId || !recipientId || recipientId === user.id) {
        return response.status(400).json({ error: '私聊对象无效' });
      }
      if (!content || content.length > 2000) {
        return response
          .status(400)
          .json({ error: '私聊内容需为 1-2000 个字符' });
      }

      const source = await getDiscussionSource(sourceId);
      if (!source || source.status !== 'approved') {
        return response.status(404).json({ error: '信息源不存在' });
      }
      const recipient = await query<{ id: string }>(
        `SELECT id
         FROM profiles
         WHERE id = $1
         LIMIT 1`,
        [recipientId]
      );
      if (!recipient[0]) {
        return response.status(404).json({ error: '私聊用户不存在' });
      }

      const rows = await query<Record<string, unknown>>(
        `INSERT INTO direct_messages
           (id, source_id, sender_id, recipient_id, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, source_id, sender_id, recipient_id, content, created_at`,
        [
          crypto.randomUUID(),
          sourceId,
          user.id,
          recipientId,
          content,
        ]
      );
      return response.status(201).json({
        data: {
          ...rows[0],
          sender_name: user.display_name,
          sender_role: user.role,
        },
      });
    } catch (error) {
      return sendApiError(response, error, '发送私聊失败');
    }
  })
);

discussionsRouter.get(
  '/messages/conversations',
  asyncRoute(async (request, response) => {
    try {
      const user = await requireUser(request);
      const sourceId =
        typeof request.query.source_id === 'string'
          ? request.query.source_id
          : '';
      if (!sourceId) {
        return response.status(400).json({ error: '缺少信息源' });
      }

      const rows = await query<Record<string, unknown>>(
        `WITH exchanges AS (
           SELECT
             CASE
               WHEN sender_id = $2 THEN recipient_id
               ELSE sender_id
             END AS peer_id,
             content,
             created_at
           FROM direct_messages
           WHERE source_id = $1
             AND (sender_id = $2 OR recipient_id = $2)
         ),
         latest AS (
           SELECT DISTINCT ON (peer_id)
             peer_id,
             content AS last_message,
             created_at AS last_at
           FROM exchanges
           ORDER BY peer_id, created_at DESC
         )
         SELECT
           latest.peer_id,
           p.display_name,
           p.role AS peer_role,
           latest.last_message,
           latest.last_at
         FROM latest
         JOIN profiles p ON p.id = latest.peer_id
         ORDER BY latest.last_at DESC
         LIMIT 100`,
        [sourceId, user.id]
      );
      return response.json({ data: rows });
    } catch (error) {
      return sendApiError(response, error, '获取私聊会话失败');
    }
  })
);
