import { query } from './db.js'
import { sanitizeKnowledgeContent } from './anti-injection.js'
import {
  createMatchProfiles,
  rankWithProfiles,
  type SearchEntities,
} from './search-ranking.js'

export const SEARCH_MATCH_THRESHOLD = 58

export interface KnowledgeSearchResult {
  id: string
  title: string
  content: string
  sanitized_content: string
  source_level: string
  review_status: string
  updated_at: string
  tags: Array<{ id: string; name: string; description?: string | null }>
  tag_match: number
  overall_match: number
}

export interface SearchAttemptSummary {
  attempt: number
  count: number
  bestScore: number
  candidateCount: number
  threshold: number
  strategy: string
}

export interface KnowledgeSearchOutcome {
  results: KnowledgeSearchResult[]
  attempts: SearchAttemptSummary[]
}

interface SearchParams {
  question: string
  tagNames?: string[]
  keywords?: string[]
  entities?: SearchEntities
  limit?: number
  threshold?: number
}

interface KnowledgeRow {
  id: string
  title: string
  content: string
  source_level: string
  review_status: string
  updated_at: Date | string
  knowledge_item_tags: Array<{
    tag_id: string
    tags: { id: string; name: string; description: string | null }
  }> | null
}

interface KnowledgeCandidate {
  title: string
  content: string
  tagNames: string[]
  result: KnowledgeSearchResult
}

const EMPTY_ENTITIES: SearchEntities = {
  time: [],
  locations: [],
  people: [],
}

export async function searchKnowledgeDetailed({
  question,
  tagNames = [],
  keywords = [],
  entities = EMPTY_ENTITIES,
  limit = 3,
  threshold = SEARCH_MATCH_THRESHOLD,
}: SearchParams): Promise<KnowledgeSearchOutcome> {
  const rows = await query<KnowledgeRow>(
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
             'tags', json_build_object('id', t.id, 'name', t.name, 'description', t.description)
           )
           ORDER BY t.name
         ) FILTER (WHERE kit.tag_id IS NOT NULL),
         '[]'::json
       ) AS knowledge_item_tags
     FROM knowledge_items ki
     LEFT JOIN knowledge_item_tags kit ON kit.knowledge_item_id = ki.id
     LEFT JOIN tags t ON t.id = kit.tag_id
     WHERE ki.review_status = 'approved'
     GROUP BY ki.id
     ORDER BY ki.updated_at DESC
     LIMIT 500`
  )

  const candidates: KnowledgeCandidate[] = rows.map((item) => {
    const tags = item.knowledge_item_tags
      ? item.knowledge_item_tags
          .map((entry) => entry.tags)
          .filter(Boolean)
      : []
    return {
      title: item.title,
      content: item.content,
      tagNames: tags.map((tag) => tag.name),
      descriptionText: tags
        .map((tag) => tag.description || '')
        .filter(Boolean)
        .join(' '),
      result: {
        id: item.id,
        title: item.title,
        content: item.content,
        sanitized_content: sanitizeKnowledgeContent(item.content),
        source_level: item.source_level,
        review_status: item.review_status,
        updated_at:
          item.updated_at instanceof Date
            ? item.updated_at.toISOString()
            : item.updated_at,
        tags,
        tag_match: 0,
        overall_match: 0,
      },
    }
  })

  const profiles = createMatchProfiles(
    question,
    tagNames,
    keywords,
    entities
  )
  const outcome = rankWithProfiles(
    candidates,
    profiles,
    question,
    threshold,
    limit
  )

  return {
    attempts: outcome.attempts,
    results: outcome.matches.map((match) => ({
      ...match.item.result,
      tag_match: match.tagMatch,
      overall_match: match.score,
    })),
  }
}

export async function searchKnowledge(
  params: SearchParams
): Promise<KnowledgeSearchResult[]> {
  return (await searchKnowledgeDetailed(params)).results
}
