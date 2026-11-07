import { appConfig } from './config.js'
import { sanitizeKnowledgeContent } from './anti-injection.js'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

type SearchParser = (
  html: string,
  baseUrl: string
) => WebSearchResult[]

const MAX_PARSED_RESULTS_PER_PROVIDER = 30

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }

  return value
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return named[name.toLowerCase()] || match
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ' '
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const code = Number.parseInt(decimal, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ' '
    })
}

function cleanText(value: string): string {
  return sanitizeKnowledgeContent(
    decodeHtmlEntities(stripHtml(value))
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function readHtml(response: Response): Promise<string> {
  return response.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    const headerCharset = response.headers
      .get('content-type')
      ?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
    const preview = new TextDecoder('utf-8', { fatal: false }).decode(
      bytes.slice(0, 4096)
    )
    const metaCharset = preview.match(
      /charset\s*=\s*["']?([\w-]+)/i
    )?.[1]
    const requestedCharset = (
      headerCharset ||
      metaCharset ||
      'utf-8'
    ).toLowerCase()
    const charset =
      requestedCharset === 'gb2312' || requestedCharset === 'gbk'
        ? 'gb18030'
        : requestedCharset

    try {
      return new TextDecoder(charset, { fatal: false }).decode(bytes)
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }
  })
}

function sanitizeSearchQuery(value: string): string {
  const cleaned = value
    .replace(/1[3-9]\d{9}/g, '[联系方式已隐藏]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱已隐藏]')
    .replace(/\b\d{8,}\b/g, '[数字已隐藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)

  if (!cleaned) return '常州大学 西太湖校区 校园生活'
  return /常州大学|西太湖校区/.test(cleaned)
    ? cleaned
    : `常州大学 西太湖校区 ${cleaned}`
}

export function shouldUseWebSearch(query: string): boolean {
  return /规划|行程|路线|半日|一日|安排|推荐|广域|周边|附近|周末|吃什么|玩什么|去哪|交通|校车|活动|攻略|备选/.test(
    query
  )
}

function getAttribute(attributes: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attributes.match(
    new RegExp(
      `\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      'i'
    )
  )
  return decodeHtmlEntities(match?.[1] || match?.[2] || match?.[3] || '')
}

function normalizeResultUrl(value: string, baseUrl: string): string {
  const decoded = decodeHtmlEntities(value).trim()
  if (!decoded || /^javascript:/i.test(decoded)) return ''

  try {
    const url = new URL(decoded, baseUrl)
    return /^https?:$/.test(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function extractSnippet(tail: string): string {
  const candidates = [
    ...tail.matchAll(
      /<(p|div|span)[^>]*class\s*=\s*["'][^"']*(?:res-desc|b_caption|text-layout|summary|star-wiki)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi
    ),
  ]
    .map((match) => cleanText(match[2]))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)

  return candidates[0]?.slice(0, 500) || ''
}

function isUsableResult(
  result: WebSearchResult,
  results: WebSearchResult[]
): boolean {
  const normalizedTitle = result.title.replace(/\s+/g, '').toLowerCase()
  if (result.title.length < 2 || !/^https?:\/\//i.test(result.url)) {
    return false
  }
  if (
    /^(首页|登录|注册|下一页|上一页|查看更多|搜索|网页|资讯|贴吧|知道|图片|视频)$/.test(
      result.title.trim()
    )
  ) {
    return false
  }

  return !results.some(
    (item) =>
      item.url === result.url ||
      item.title.replace(/\s+/g, '').toLowerCase() === normalizedTitle
  )
}

function relevanceScore(result: WebSearchResult): number {
  const text = `${result.title} ${result.snippet} ${result.url}`.toLowerCase()
  let score = 0
  if (/常州大学|西太湖|常大|cczu/.test(text)) score += 4
  if (/常州|武进/.test(text)) score += 1

  const topicMatches = [
    /运动|健身|羽毛球|篮球|跑步|操场|体育馆/,
    /食堂|美食|餐厅|吃饭|咖啡|小吃/,
    /行程|周末|半日|一日|攻略|景点|旅游|周边/,
    /交通|公交|地铁|校车|路线/,
    /图书馆|自习|学习|书店/,
  ].filter((pattern) => pattern.test(text)).length

  return score + topicMatches
}

function isRelevantResult(result: WebSearchResult): boolean {
  const text = `${result.title} ${result.snippet}`.toLowerCase()
  if (/广告|推广链接|赞助商/.test(text)) return false

  const score = relevanceScore(result)
  return (
    score >= 2 &&
    (/常州大学|西太湖|常大|cczu|常州|武进/.test(text) ||
      /\.edu\.cn(?:\/|$)/i.test(result.url))
  )
}

function parse360Html(html: string, baseUrl: string): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const titlePattern =
    /<h3\b[^>]*class\s*=\s*["'][^"']*\bres-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/gi
  const titleMatches = [...html.matchAll(titlePattern)]

  for (const [index, match] of titleMatches.entries()) {
    const block = match[1]
    const anchor = block.match(
      /<a\b([^>]*)>([\s\S]*?)<\/a>/i
    )
    if (!anchor) continue

    const href =
      getAttribute(anchor[1], 'data-mdurl') ||
      getAttribute(anchor[1], 'data-url') ||
      getAttribute(anchor[1], 'href')
    const url = normalizeResultUrl(href, baseUrl)
    const title = cleanText(anchor[2]).slice(0, 180)
    const endIndex = (match.index || 0) + match[0].length
    const nextIndex =
      titleMatches[index + 1]?.index ||
      Math.min(html.length, endIndex + 2400)
    const snippet = extractSnippet(html.slice(endIndex, nextIndex))
    const result = {
      title,
      url,
      snippet,
      source: '360 搜索',
    }

    if (isUsableResult(result, results)) results.push(result)
    if (results.length >= MAX_PARSED_RESULTS_PER_PROVIDER) break
  }

  return results
}

function parseBingHtml(html: string, baseUrl: string): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const titlePattern =
    /<h2\b[^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/gi
  const titleMatches = [...html.matchAll(titlePattern)]

  for (const [index, match] of titleMatches.entries()) {
    const href = getAttribute(match[1], 'href')
    const url = normalizeResultUrl(href, baseUrl)
    const title = cleanText(match[2]).slice(0, 180)
    const endIndex = (match.index || 0) + match[0].length
    const nextIndex =
      titleMatches[index + 1]?.index ||
      Math.min(html.length, endIndex + 2400)
    const snippet = extractSnippet(html.slice(endIndex, nextIndex))
    const result = {
      title,
      url,
      snippet,
      source: '必应搜索',
    }

    if (isUsableResult(result, results)) results.push(result)
    if (results.length >= MAX_PARSED_RESULTS_PER_PROVIDER) break
  }

  return results
}

function parseSogouHtml(html: string, baseUrl: string): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const titlePattern =
    /<h3\b[^>]*class\s*=\s*["'][^"']*(?:vr-title|pt)[^"']*["'][^>]*>([\s\S]*?)<\/h3>/gi
  const titleMatches = [...html.matchAll(titlePattern)]

  for (const [index, match] of titleMatches.entries()) {
    const anchor = match[1].match(
      /<a\b([^>]*)>([\s\S]*?)<\/a>/i
    )
    if (!anchor) continue

    const url = normalizeResultUrl(
      getAttribute(anchor[1], 'href'),
      baseUrl
    )
    const title = cleanText(anchor[2]).slice(0, 180)
    const endIndex = (match.index || 0) + match[0].length
    const nextIndex =
      titleMatches[index + 1]?.index ||
      Math.min(html.length, endIndex + 2400)
    const snippet = extractSnippet(html.slice(endIndex, nextIndex))
    const result = {
      title,
      url,
      snippet,
      source: '搜狗搜索',
    }

    if (isUsableResult(result, results)) results.push(result)
    if (results.length >= MAX_PARSED_RESULTS_PER_PROVIDER) break
  }

  return results
}

function getParsersForUrl(url: URL): SearchParser[] {
  const host = url.hostname.toLowerCase()
  if (host.includes('bing.')) return [parseBingHtml]
  if (host.includes('sogou.')) return [parseSogouHtml]
  if (host.includes('so.com')) return [parse360Html]

  return [parse360Html, parseBingHtml, parseSogouHtml]
}

async function searchProvider(
  baseUrl: string,
  query: string
): Promise<WebSearchResult[]> {
  const searchUrl = new URL(baseUrl)
  searchUrl.searchParams.set('q', query)

  const response = await fetch(searchUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
      Referer: `${searchUrl.protocol}//${searchUrl.host}/`,
    },
    signal: AbortSignal.timeout(appConfig.webSearch.timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`${searchUrl.host} 返回 ${response.status}`)
  }

  const html = await readHtml(response)
  for (const parser of getParsersForUrl(searchUrl)) {
    const results = parser(html, searchUrl.toString())
    if (results.length > 0) return results
  }

  return []
}

export async function searchWeb(
  query: string
): Promise<WebSearchResult[]> {
  if (!appConfig.webSearch.enabled) return []

  const providers = [
    appConfig.webSearch.baseUrl,
    ...appConfig.webSearch.fallbackUrls,
  ].filter(
    (url, index, urls) => Boolean(url) && urls.indexOf(url) === index
  )
  const safeQuery = sanitizeSearchQuery(query)
  const collected: WebSearchResult[] = []
  const errors: string[] = []

  for (const provider of providers) {
    try {
      const results = await searchProvider(provider, safeQuery)
      for (const result of results) {
        if (!isRelevantResult(result)) continue
        if (isUsableResult(result, collected)) collected.push(result)
        if (collected.length >= appConfig.webSearch.limit) break
      }
      if (collected.length >= appConfig.webSearch.limit) break
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      errors.push(message)
      console.error(`Web search provider failed: ${provider}`, error)
    }
  }

  if (collected.length === 0 && errors.length > 0) {
    console.error('All web search providers failed:', errors.join('; '))
  }

  return collected.slice(0, appConfig.webSearch.limit)
}
