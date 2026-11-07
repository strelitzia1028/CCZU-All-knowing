import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { isDbConfigured } from '../db.js';
import { getCurrentUser } from '../session.js';
import { streamChat } from '../llm.js';
import {
  buildAgentMessages,
  buildReasoningMessages,
  finalizeReasoningSupplement,
  normalizeAgentHistory,
  prepareAgentContext,
  prepareReasoningRetrieval,
} from '../agent.js';
import {
  searchWeb,
  shouldUseWebSearch,
  type WebSearchResult,
} from '../web-search.js';

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

      let strictAnswer = '';
      if (context.requiresFallbackOnly) {
        strictAnswer = '无法找到匹配项，请减少限定词';
        writeEvent({
          type: 'chunk',
          content: strictAnswer,
        });
      } else {
        const stream = streamChat(buildAgentMessages(context, message));
        for await (const chunk of stream) {
          strictAnswer += chunk;
          writeEvent({ type: 'chunk', content: chunk });
        }

        const expiredSources = context.communitySources.filter(
          (source) => source.is_expired
        );
        if (
          expiredSources.length > 0 &&
          !/(过期|失效|有效期)/.test(strictAnswer)
        ) {
          const titles = expiredSources
            .slice(0, 3)
            .map((source) => `「${source.title}」`)
            .join('、');
          const warning = `\n\n注意：${titles}已超过有效期，排序时已降权。建议先联系发布者确认现状后再使用。`;
          strictAnswer += warning;
          writeEvent({ type: 'chunk', content: warning });
        }
      }

      if (context.plan.intent !== 'smalltalk') {
        writeEvent({ type: 'reasoning_started' });
        try {
          let reasoningRetrieval = {
            knowledgeResults: context.knowledgeResults,
            communitySources: context.communitySources,
            webResults: [] as WebSearchResult[],
          };
          try {
            const broader = await prepareReasoningRetrieval(context);
            reasoningRetrieval = {
              ...broader,
              webResults: [],
            };
          } catch (error) {
            console.error(
              'AI reasoning retrieval failed, using strict context:',
              error
            );
          }

          if (shouldUseWebSearch(context.plan.need_summary)) {
            const webStartedAt = Date.now();
            writeEvent({
              type: 'agent_trace',
              step: {
                id: 'reasoning_web_search',
                tool: 'search_web_supplement',
                label: 'AI 补充网络检索',
                status: 'running',
                summary: '正在搜索可补充行程规划与广域推荐的网络信息...',
                duration_ms: 0,
              },
            });
            try {
              const webResults = await searchWeb(
                context.plan.need_summary
              );
              reasoningRetrieval = {
                ...reasoningRetrieval,
                webResults,
              };
              writeEvent({
                type: 'agent_trace',
                step: {
                  id: 'reasoning_web_search',
                  tool: 'search_web_supplement',
                  label: 'AI 补充网络检索',
                  status: 'completed',
                  summary:
                    webResults.length > 0
                      ? `网络检索完成，获得 ${webResults.length} 条补充结果`
                      : '网络检索完成，暂未获得可用补充结果',
                  duration_ms: Date.now() - webStartedAt,
                },
              });
            } catch (error) {
              console.error('AI reasoning web search failed:', error);
              writeEvent({
                type: 'agent_trace',
                step: {
                  id: 'reasoning_web_search',
                  tool: 'search_web_supplement',
                  label: 'AI 补充网络检索',
                  status: 'warning',
                  summary: '网络检索不可用，已继续使用本地广域素材',
                  duration_ms: Date.now() - webStartedAt,
                },
              });
            }
          }
          const reasoningStream = streamChat(
            buildReasoningMessages(context, message, reasoningRetrieval)
          );
          let reasoningText = '';
          for await (const chunk of reasoningStream) {
            reasoningText += chunk;
          }
          writeEvent({
            type: 'reasoning_chunk',
            content: finalizeReasoningSupplement(
              reasoningText,
              context,
              message,
              reasoningRetrieval
            ),
          });
          writeEvent({ type: 'reasoning_done' });
        } catch (error) {
          console.error('AI reasoning supplement failed:', error);
          writeEvent({
            type: 'reasoning_error',
            error:
              error instanceof Error
                ? error.message
                : 'AI 推理补充生成失败',
          });
        }
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
