import { extractFallbackKeywords } from './search-exclusions.js'

export interface SearchEntities {
  time: string[]
  locations: string[]
  people: string[]
}

export interface RankedCandidate<T> {
  item: T
  score: number
  tagMatch: number
  keywordMatch: number
  entityMatch: number
}

export interface SearchMatchProfile {
  attempt: number
  strategy: 'all_tags' | 'any_tag' | 'keywords_only'
  tagMode: 'all' | 'any' | 'none'
  tags: string[]
  keywords: string[]
  entities: SearchEntities
}

interface RankableText {
  title: string
  content: string
  location?: string | null
  tagNames: string[]
  descriptionText?: string
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/明天晚上/g, '明晚')
    .replace(/今天晚上/g, '今晚')
    .replace(/常州大学西太湖校区|西太湖校区|校园|学校|校内/g, '')
    .replace(/[二两]楼/g, '2楼')
    .replace(/\s+/g, '')
}

function normalizedUnique(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length >= 2)
        .map((value) => value.toLowerCase())
    ),
  ]
}

function ratio(matches: number, total: number): number {
  return total === 0 ? 0 : matches / total
}

function scoreTerms(terms: string[], title: string, content: string): number {
  if (terms.length === 0) return 0
  const normalizedTitle = normalize(title)
  const normalizedContent = normalize(content)
  const matched = terms.filter(
    (term) =>
      normalizedTitle.includes(normalize(term)) ||
      normalizedContent.includes(normalize(term))
  ).length
  return ratio(matched, terms.length)
}

export function createMatchProfiles(
  query: string,
  tags: string[],
  keywords: string[],
  entities: SearchEntities
): SearchMatchProfile[] {
  const normalizedTags = normalizedUnique(tags)
  const normalizedKeywords = normalizedUnique([
    ...keywords,
    ...extractFallbackKeywords(query),
  ])
  const normalizedEntities = {
    time: normalizedUnique(entities.time),
    locations: normalizedUnique(entities.locations),
    people: normalizedUnique(entities.people),
  }

  return [
    {
      attempt: 1,
      strategy: 'all_tags',
      tagMode: 'all',
      tags: normalizedTags,
      keywords: normalizedKeywords.slice(0, 10),
      entities: normalizedEntities,
    },
    {
      attempt: 2,
      strategy: 'any_tag',
      tagMode: 'any',
      tags: normalizedTags,
      keywords: normalizedKeywords.slice(0, 8),
      entities: normalizedEntities,
    },
    {
      attempt: 3,
      strategy: 'keywords_only',
      tagMode: 'none',
      tags: [],
      keywords: normalizedKeywords.slice(0, 4),
      entities: normalizedEntities,
    },
  ]
}

export function rankCandidate<T extends RankableText>(
  item: T,
  profile: SearchMatchProfile,
  query: string
): RankedCandidate<T> {
  const itemTags = normalizedUnique(item.tagNames)
  const tagMatches = profile.tags.filter((tag) =>
    itemTags.some(
      (itemTag) => itemTag === tag || itemTag.includes(tag) || tag.includes(itemTag)
    )
  ).length
  const tagRatio = ratio(tagMatches, profile.tags.length)
  const tagMatch =
    profile.tagMode === 'none'
      ? 0
      : profile.tagMode === 'any' && tagMatches > 0
        ? Math.max(0.6, tagRatio)
        : tagRatio
  const keywordMatch = scoreTerms(
    profile.keywords,
    item.title,
    `${item.content} ${item.location || ''} ${item.descriptionText || ''}`
  )
  const entityText = `${item.title} ${item.content} ${item.location || ''} ${item.descriptionText || ''}`
  const timeMatch = scoreTerms(
    profile.entities.time,
    item.title,
    entityText
  )
  const locationMatch = scoreTerms(
    profile.entities.locations,
    item.title,
    entityText
  )
  const peopleMatch = scoreTerms(
    profile.entities.people,
    item.title,
    entityText
  )
  const entityGroups = [
    { terms: profile.entities.time, score: timeMatch },
    { terms: profile.entities.locations, score: locationMatch },
    { terms: profile.entities.people, score: peopleMatch },
  ].filter((group) => group.terms.length > 0)
  const entityMatch =
    entityGroups.length === 0
      ? 0
      : entityGroups.reduce((sum, group) => sum + group.score, 0) /
        entityGroups.length
  const exactQueryMatch = normalize(
    `${item.title} ${item.content} ${item.descriptionText || ''}`
  ).includes(normalize(query))

  const signals: Array<{ value: number; weight: number }> = []
  if (profile.tagMode !== 'none' && profile.tags.length > 0) {
    signals.push({ value: tagMatch, weight: 50 })
  }
  if (profile.keywords.length > 0) {
    signals.push({ value: keywordMatch, weight: 30 })
  }
  if (entityGroups.length > 0) {
    signals.push({ value: entityMatch, weight: 20 })
  }
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0)
  let score =
    totalWeight === 0
      ? 0
      : (signals.reduce(
          (sum, signal) => sum + signal.value * signal.weight,
          0
        ) /
          totalWeight) *
        100
  if (profile.tags.length === 1 && tagMatches > 0) {
    score = 100
  }
  if (exactQueryMatch) score += 25
  if (
    entityGroups.length > 0 &&
    entityGroups.some((group) => group.score === 0)
  ) {
    score = 0
  }

  return {
    item,
    score: Math.min(100, Math.round(score)),
    tagMatch:
      profile.tagMode === 'any'
        ? Math.round(tagRatio * 100)
        : Math.round(tagMatch * 100),
    keywordMatch: Math.round(keywordMatch * 100),
    entityMatch: Math.round(entityMatch * 100),
  }
}

export function rankWithProfiles<T extends RankableText>(
  items: T[],
  profiles: SearchMatchProfile[],
  query: string,
  threshold: number,
  limit: number
): {
  matches: RankedCandidate<T>[]
  attempts: Array<{
    attempt: number
    count: number
    bestScore: number
    candidateCount: number
    threshold: number
    strategy: string
  }>
} {
  const attempts: Array<{
    attempt: number
    count: number
    bestScore: number
    candidateCount: number
    threshold: number
    strategy: string
  }> = []
  const candidateCount = items.length
  const smallCandidateSet = candidateCount <= 50
  const adaptiveThreshold = smallCandidateSet
    ? Math.min(25, threshold)
    : candidateCount <= 100
      ? 50
      : candidateCount <= 300
        ? 55
        : 60
  const effectiveLimit = smallCandidateSet
    ? limit
    : candidateCount <= 200
      ? Math.min(limit, 6)
      : Math.min(limit, 3)
  const aggregated = new Map<T, RankedCandidate<T>>()

  for (const profile of profiles) {
    const ranked = items
      .map((item) => rankCandidate(item, profile, query))
      .filter(
        (item) =>
          item.score >= adaptiveThreshold &&
          (profile.tagMode !== 'all' ||
            profile.tags.length === 0 ||
            item.tagMatch === 100)
      )
      .sort((left, right) => right.score - left.score)
    attempts.push({
      attempt: profile.attempt,
      count: ranked.length,
      bestScore: ranked[0]?.score || 0,
      candidateCount,
      threshold: adaptiveThreshold,
      strategy: profile.strategy,
    })

    if (smallCandidateSet) {
      for (const match of ranked) {
        const existing = aggregated.get(match.item)
        if (!existing || match.score > existing.score) {
          aggregated.set(match.item, match)
        }
      }
      continue
    }

    if (ranked.length > 0) {
      return {
        matches: ranked.slice(0, effectiveLimit),
        attempts,
      }
    }
  }

  return {
    matches: [...aggregated.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, effectiveLimit),
    attempts,
  }
}
