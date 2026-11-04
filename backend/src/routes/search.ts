import { Router } from 'express';
import { asyncRoute, sendApiError } from '../http.js';
import { searchKnowledge } from '../knowledge-search.js';
import { extractTags } from '../llm.js';

export const searchRouter = Router();

searchRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const question =
        typeof request.query.q === 'string' ? request.query.q.trim() : '';
      if (!question) {
        return response.json({ data: [] });
      }

      const tagNames = await extractTags(question);
      const data = await searchKnowledge({ question, tagNames });
      return response.json({ data, extracted_tags: tagNames });
    } catch (error) {
      return sendApiError(response, error, '知识库检索失败');
    }
  })
);
