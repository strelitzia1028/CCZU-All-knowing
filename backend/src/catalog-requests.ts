import { query } from './db.js'
import { isExcludedTerm } from './search-exclusions.js'

export interface CatalogRequestSuggestion {
  request_type: 'tag' | 'source_type'
  name: string
  code?: string | null
  description?: string | null
}

export interface CreatedCatalogRequest extends CatalogRequestSuggestion {
  id: string
}

export interface SourceTypeSuggestion {
  label: string
  code: string
  description?: string | null
}

function cleanTagNames(tagNames: string[]): string[] {
  return [
    ...new Set(
      tagNames
        .map((name) => name.trim())
        .filter(
          (name) =>
            name.length >= 2 &&
            name.length <= 20 &&
            !isExcludedTerm(name)
        )
    ),
  ].slice(0, 5)
}

export async function queueCatalogRequests(
  userId: string,
  tagNames: string[],
  sourceType?: SourceTypeSuggestion | null
): Promise<CreatedCatalogRequest[]> {
  const created: CreatedCatalogRequest[] = []

  for (const name of cleanTagNames(tagNames)) {
    const activeTag = await query<{ id: string }>(
      `SELECT id
       FROM tags
       WHERE lower(name) = lower($1)
          OR lower(name) LIKE '%' || lower($1) || '%'
          OR lower($1) LIKE '%' || lower(name) || '%'
       LIMIT 1`,
      [name]
    )
    if (activeTag[0]) continue

    const pending = await query<{ id: string }>(
      `SELECT id
       FROM catalog_requests
       WHERE request_type = 'tag'
         AND status = 'pending'
         AND lower(name) = lower($1)
       LIMIT 1`,
      [name]
    )
    if (pending[0]) continue

    const rows = await query<CreatedCatalogRequest>(
      `INSERT INTO catalog_requests
         (id, request_type, name, description, requested_by)
       VALUES ($1, 'tag', $2, $3, $4)
       RETURNING id, request_type, name, code, description`,
      [
        crypto.randomUUID(),
        name,
        'Agent 从用户发布内容中识别到尚未收录的标签',
        userId,
      ]
    )
    if (rows[0]) created.push(rows[0])
  }

  if (sourceType) {
    const label = sourceType.label.trim().slice(0, 64)
    const code = sourceType.code.trim().toLowerCase()
    if (
      label &&
      /^[a-z][a-z0-9_]{1,49}$/.test(code)
    ) {
      const existing = await query<{ id: string }>(
        `SELECT id
         FROM source_types
         WHERE lower(label) = lower($1) OR value = $2
         LIMIT 1`,
        [label, code]
      )
      const pending = await query<{ id: string }>(
        `SELECT id
         FROM catalog_requests
         WHERE request_type = 'source_type'
           AND status = 'pending'
           AND (lower(name) = lower($1) OR lower(code) = lower($2))
         LIMIT 1`,
        [label, code]
      )

      if (!existing[0] && !pending[0]) {
        const rows = await query<CreatedCatalogRequest>(
          `INSERT INTO catalog_requests
             (id, request_type, name, code, description, requested_by)
           VALUES ($1, 'source_type', $2, $3, $4, $5)
           RETURNING id, request_type, name, code, description`,
          [
            crypto.randomUUID(),
            label,
            code,
            sourceType.description?.trim().slice(0, 500) ||
              'Agent 从用户发布内容中识别到尚未收录的信息源类型',
            userId,
          ]
        )
        if (rows[0]) created.push(rows[0])
      }
    }
  }

  return created
}
