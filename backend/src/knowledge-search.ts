import { query } from './db.js';
import {
  sanitizeKnowledgeContent,
  stripDemoMarker,
} from './anti-injection.js';

export interface KnowledgeSearchResult {
  id: string;
  title: string;
  content: string;
  sanitized_content: string;
  source_level: string;
  review_status: string;
  updated_at: string;
  tags: Array<{ id: string; name: string }>;
  tag_match: number;
  overall_match: number;
}

interface SearchParams {
  question: string;
  tagNames?: string[];
}

interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  source_level: string;
  review_status: string;
  updated_at: Date | string;
  knowledge_item_tags: Array<{
    tag_id: string;
    tags: { id: string; name: string };
  }> | null;
}

function extractKeywordTokens(text: string): string[] {
  const tokens: string[] = [];
  const words = text
    .toLowerCase()
    .replace(/[，。？！、；：,\s]+/g, ' ')
    .split(' ')
    .filter(Boolean);

  for (const word of words) {
    if (word.length >= 2) tokens.push(word);
    if (/[\u4e00-\u9fa5]/.test(word)) {
      for (let index = 0; index <= word.length - 2; index += 1) {
        tokens.push(word.slice(index, index + 2));
      }
    }
  }

  return [...new Set(tokens)].slice(0, 20);
}

function calculateKeywordScore(title: string, content: string, question: string) {
  const titleText = title.toLowerCase();
  const contentText = content.toLowerCase();
  const queryText = question.toLowerCase();
  const tokens = extractKeywordTokens(question);
  let score = 0;

  if (queryText && titleText.includes(queryText)) score += 60;
  if (queryText && contentText.includes(queryText)) score += 25;

  if (tokens.length > 0) {
    const titleMatches = tokens.filter((token) => titleText.includes(token)).length;
    const contentMatches = tokens.filter((token) => contentText.includes(token)).length;
    score += (titleMatches / tokens.length) * 20;
    score += (contentMatches / tokens.length) * 10;
  }

  return Math.min(100, Math.round(score));
}

export async function searchKnowledge({
  question,
  tagNames = [],
}: SearchParams): Promise<KnowledgeSearchResult[]> {
  const normalizedTags = [
    ...new Set(
      tagNames
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 8);

  const rows = (await query(
    `SELECT
       ki.id,
       ki.title,
       ki.content,
       ki.source_level,
       ki.review_status,
       ki.updated_at,
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
     WHERE ki.review_status = 'approved'
       AND (
         cardinality($1::text[]) = 0
         OR EXISTS (
           SELECT 1
           FROM knowledge_item_tags kit2
           JOIN tags t2 ON t2.id = kit2.tag_id
           WHERE kit2.knowledge_item_id = ki.id
             AND lower(t2.name) = ANY($1::text[])
         )
         OR ki.title ILIKE '%' || $2 || '%'
         OR ki.content ILIKE '%' || $2 || '%'
       )
     GROUP BY ki.id
     ORDER BY ki.updated_at DESC
     LIMIT 50`,
    [normalizedTags, question]
  )) as unknown as KnowledgeRow[];

  const scored = rows.map((item) => {
    const tags = item.knowledge_item_tags
      ? item.knowledge_item_tags.map((entry) => entry.tags).filter(Boolean)
      : [];
    const itemTagNames = tags.map((tag) => tag.name.toLowerCase());
    const intersection = normalizedTags.filter((tag) =>
      itemTagNames.includes(tag)
    );
    const tagMatch =
      normalizedTags.length === 0
        ? 0
        : Math.round((intersection.length / normalizedTags.length) * 100);
    const keywordScore = calculateKeywordScore(
      item.title,
      item.content,
      question
    );
    const overallMatch =
      normalizedTags.length === 0
        ? keywordScore
        : Math.round(tagMatch * 0.7 + keywordScore * 0.3);

    return {
      id: item.id,
      title: item.title,
      content: item.content,
      sanitized_content: stripDemoMarker(
        sanitizeKnowledgeContent(item.content)
      ),
      source_level: item.source_level,
      review_status: item.review_status,
      updated_at:
        item.updated_at instanceof Date
          ? item.updated_at.toISOString()
          : item.updated_at,
      tags,
      tag_match: tagMatch,
      overall_match: overallMatch,
      keyword_score: keywordScore,
    };
  });

  return scored
    .filter((item) =>
      normalizedTags.length > 0
        ? item.tag_match >= 30 || item.keyword_score >= 30
        : item.overall_match > 0
    )
    .sort(
      (left, right) =>
        right.overall_match - left.overall_match ||
        right.tag_match - left.tag_match
    )
    .slice(0, 3)
    .map(({ keyword_score: _keywordScore, ...item }) => item);
}
