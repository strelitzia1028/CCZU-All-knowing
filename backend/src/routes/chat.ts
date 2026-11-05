import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { isDbConfigured } from '../db.js';
import { getCurrentUser } from '../session.js';
import { streamChat } from '../llm.js';
import {
  buildAgentMessages,
  normalizeAgentHistory,
  prepareAgentContext,
} from '../agent.js';

export const chatRouter = Router();

chatRouter.post(
  '/',
  asyncRoute(async (request, response) => {
    const message =
      typeof request.body?.message === 'string'
        ? request.body.message.trim()
        : '';
    const requestedSessionId =
      typeof request.body?.session_id === 'string'
        ? request.body.session_id
        : null;

    if (!message) {
      return response.status(400).json({ error: '消息不能为空' });
    }

    try {
      const user = await getCurrentUser(request);
      if (!user) {
        return response
          .status(401)
          .json({ error: '未登录或会话已过期' });
      }

      const dbConfigured = isDbConfigured();
      if (!dbConfigured) {
        return response
          .status(503)
          .json({ error: 'Agent 需要连接数据库后才能运行' });
      }

      const history = normalizeAgentHistory(request.body?.history);
      const sessionId =
        requestedSessionId &&
        /^[a-zA-Z0-9-]{8,80}$/.test(requestedSessionId)
          ? requestedSessionId
          : `local-${crypto.randomUUID()}`;

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();

      const writeEvent = (payload: unknown) => {
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      writeEvent({
        type: 'started',
        session_id: sessionId,
      });

      const context = await prepareAgentContext(message, {
        userId: user.id,
        history,
        onTrace: (step) => {
          writeEvent({
            type: 'agent_trace',
            step,
          });
        },
      });

      writeEvent({
        type: 'metadata',
        category: context.plan.intent,
        session_id: sessionId,
        database_available: true,
        need_summary: context.plan.need_summary,
        extracted_tags: context.plan.tags,
        resolved_request: context.plan.request_text,
        context_reason: context.plan.context_reason,
        search_attempts: {
          knowledge: context.knowledgeAttempts,
          sources: context.sourceAttempts,
        },
        catalog_requests: context.catalogRequests,
        requires_fallback: context.requiresFallbackOnly,
        agent_trace: context.trace,
        draft: context.draft,
        community_sources: context.communitySources,
        sources: context.knowledgeResults.map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content,
          source_level: item.source_level,
          updated_at: item.updated_at,
          tag_match: item.tag_match,
          overall_match: item.overall_match,
          tags: item.tags,
        })),
      });

      if (context.requiresFallbackOnly) {
        writeEvent({
          type: 'chunk',
          content: '无法找到匹配项，请减少限定词',
        });
        writeEvent({ type: 'done' });
        response.end();
        return;
      }

      const stream = streamChat(buildAgentMessages(context, message));
      let answerText = '';

      for await (const chunk of stream) {
        answerText += chunk;
        writeEvent({ type: 'chunk', content: chunk });
      }

      const expiredSources = context.communitySources.filter(
        (source) => source.is_expired
      );
      if (
        expiredSources.length > 0 &&
        !/(过期|失效|有效期)/.test(answerText)
      ) {
        const titles = expiredSources
          .slice(0, 3)
          .map((source) => `「${source.title}」`)
          .join('、');
        writeEvent({
          type: 'chunk',
          content: `\n\n注意：${titles}已超过有效期，排序时已降权。建议先联系发布者确认现状后再使用。`,
        });
      }

      writeEvent({ type: 'done' });
      response.end();
    } catch (error) {
      if (response.headersSent) {
        response.write(
          `data: ${JSON.stringify({
            type: 'error',
            error:
              error instanceof Error ? error.message : 'Agent 执行失败',
          })}\n\n`
        );
        response.end();
        return;
      }
      return sendApiError(response, error, 'Agent 执行失败');
    }
  })
);
