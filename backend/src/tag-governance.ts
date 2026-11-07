import { isExcludedTerm } from './search-exclusions.js'

export interface TagCatalogEntry {
  name: string
  description?: string | null
}

export interface RejectedTagCandidate {
  name: string
  reason: string
}

export interface NovelTagFilterResult {
  accepted: string[]
  rejected: RejectedTagCandidate[]
}

const MIN_TAG_LENGTH = 2
const MAX_TAG_LENGTH = 12
const MAX_NEW_TAGS = 1
const VALID_TAG_NAME = /^[\u3400-\u9fffA-Za-z0-9-]+$/u
const INVALID_EDGE_CHARACTERS = /^[的了着过吗呢吧啊呀哦么我你他她它这那此其并与及或和就也还又很更最]+|[的了着过吗呢吧啊呀哦么我你他她它这那此其并与及或和就也还又很更最]+$/u
const INVALID_CONNECTIVES =
  /以及|或者|然后|因为|所以|但是|而且|如果|就是|还是|可以|需要|想要|帮忙|发布|寻找|求购/u

function normalizeTagName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^[“”"'‘’《》【】()[\]{}]+|[“”"'‘’《》【】()[\]{}]+$/g, '')
    .replace(/\s+/g, '')
}

export function isValidStandaloneTagName(value: string): boolean {
  const name = normalizeTagName(value)
  const length = [...name].length
  if (
    length < MIN_TAG_LENGTH ||
    length > MAX_TAG_LENGTH ||
    !VALID_TAG_NAME.test(name) ||
    isExcludedTerm(name) ||
    INVALID_EDGE_CHARACTERS.test(name) ||
    INVALID_CONNECTIVES.test(name) ||
    /^[\d-]+$/.test(name)
  ) {
    return false
  }

  return /[\u3400-\u9fff]/u.test(name)
    ? (name.match(/[\u3400-\u9fff]/gu) || []).length >= 2
    : name.length >= 2
}

function findCoveringExistingTag(
  candidate: string,
  existingTags: TagCatalogEntry[]
): TagCatalogEntry | null {
  const normalizedCandidate = normalizeTagName(candidate).toLowerCase()

  return (
    existingTags.find((tag) => {
      const normalizedName = normalizeTagName(tag.name).toLowerCase()
      if (!normalizedName) return false
      if (
        normalizedName === normalizedCandidate ||
        normalizedName.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalizedName)
      ) {
        return true
      }

      const description = (tag.description || '')
        .normalize('NFKC')
        .toLowerCase()
      return description.includes(normalizedCandidate)
    }) || null
  )
}

function findCompleteWordBoundaryMatch(
  candidate: string,
  content: string
): boolean {
  const normalizedCandidate = normalizeTagName(candidate).toLowerCase()
  const normalizedContent = content.normalize('NFKC').toLowerCase()
  if (
    !normalizedCandidate ||
    !normalizedContent.includes(normalizedCandidate)
  ) {
    return false
  }

  if (typeof Intl.Segmenter !== 'function') {
    return normalizedContent
      .split(/[\s，。！？、；：,.!?;:()[\]（）【】]+/)
      .some((word) => word === normalizedCandidate)
  }

  const segmenter = new Intl.Segmenter('zh-CN', {
    granularity: 'word',
  })
  const segments = [...segmenter.segment(normalizedContent)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment)

  for (let start = 0; start < segments.length; start += 1) {
    let joined = ''
    for (let end = start; end < segments.length; end += 1) {
      joined += segments[end]
      if (joined === normalizedCandidate) return true
      if (!normalizedCandidate.startsWith(joined)) break
    }
  }

  return false
}

export function findMatchingExistingTags(
  content: string,
  existingTags: TagCatalogEntry[]
): TagCatalogEntry[] {
  const normalizedContent = content.normalize('NFKC').toLowerCase()
  const segmenter =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('zh-CN', { granularity: 'word' })
      : null

  return existingTags
    .map((tag) => {
      const normalizedName = normalizeTagName(tag.name).toLowerCase()
      if (!normalizedName) return { tag, score: 0 }
      if (normalizedContent.includes(normalizedName)) {
        return { tag, score: 100 + normalizedName.length }
      }

      const nameSegments = segmenter
        ? [...segmenter.segment(normalizedName)]
            .filter((segment) => segment.isWordLike)
            .map((segment) => segment.segment)
            .filter(
              (segment) =>
                segment.length >= 2 && !isExcludedTerm(segment)
            )
        : []
      const overlap = nameSegments.filter((segment) =>
        normalizedContent.includes(segment)
      ).length
      return {
        tag,
        score:
          overlap > 0 && overlap * 2 >= nameSegments.length
            ? overlap * 10
            : 0,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.tag)
    .slice(0, 3)
}

export function filterNovelTagCandidates(
  candidates: string[],
  content: string,
  existingTags: TagCatalogEntry[]
): NovelTagFilterResult {
  const accepted: string[] = []
  const rejected: RejectedTagCandidate[] = []

  for (const rawCandidate of candidates) {
    const name = normalizeTagName(rawCandidate)
    if (!isValidStandaloneTagName(name)) {
      rejected.push({
        name: rawCandidate,
        reason: '不是完整、语法稳定的标签名称',
      })
      continue
    }

    const coveringTag = findCoveringExistingTag(name, existingTags)
    if (coveringTag) {
      rejected.push({
        name,
        reason: `已有 Tag「${coveringTag.name}」可以覆盖`,
      })
      continue
    }

    if (!findCompleteWordBoundaryMatch(name, content)) {
      rejected.push({
        name,
        reason: '只是原文中的字词片段，未形成完整词语',
      })
      continue
    }

    accepted.push(name)
  }

  return {
    accepted: [...new Set(accepted)].slice(0, MAX_NEW_TAGS),
    rejected,
  }
}

export function isCoveredByExistingTag(
  candidate: string,
  existingTags: TagCatalogEntry[]
): boolean {
  return Boolean(findCoveringExistingTag(candidate, existingTags))
}

