const EXCLUSION_WORDS = [
  '我',
  '你',
  '他',
  '她',
  '我们',
  '你们',
  '他们',
  '用户',
  '询问',
  '了解',
  '希望',
  '哪些',
  '整体',
  '评价',
  '的',
  '了',
  '吗',
  '呢',
  '吧',
  '啊',
  '呀',
  '是',
  '有',
  '没有',
  '有没有',
  '能',
  '能否',
  '可以',
  '可不可以',
  '请',
  '请问',
  '帮我',
  '帮忙',
  '给我',
  '我要',
  '我想',
  '需要',
  '想要',
  '找',
  '寻找',
  '求',
  '求求',
  '推荐',
  '介绍',
  '告诉',
  '一下',
  '一个',
  '一条',
  '一些',
  '这个',
  '那个',
  '这些',
  '那些',
  '什么',
  '怎么',
  '哪里',
  '哪个',
  '多少',
  '如何',
  '现在',
  '刚才',
  '上面',
  '上一条',
  '之前',
  '然后',
  '就是',
  '还是',
  '以及',
  '或者',
  '如果',
  '但是',
  '因为',
  '所以',
  '信息',
  '消息',
  '内容',
  '需求',
  '问题',
  '发布',
  '发送',
  '提交',
  '草稿',
  '手机号',
  '手机',
  '电话',
  '联系',
  '联系方式',
  '参加',
  '集合',
  '见面',
  '一起',
  '帮忙发布',
  '人',
  '同学',
  '大家',
  '校园',
  '学校',
  '附近',
  '相关',
  '合适',
  '匹配',
] as const

const EXCLUSION_SET = new Set<string>(EXCLUSION_WORDS)

export function stripExcludedWords(text: string): string {
  let result = text.toLowerCase()
  const orderedWords = [...EXCLUSION_WORDS].sort(
    (left, right) => right.length - left.length
  )
  for (const word of orderedWords) {
    result = result.split(word).join(' ')
  }
  return result
    .replace(/[，。！？、；：,.!?;:[\]()（）【】"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractFallbackKeywords(text: string): string[] {
  const cleaned = stripExcludedWords(text)
  const terms: string[] = []

  for (const word of cleaned.split(' ').filter(Boolean)) {
    if (word.length >= 2) terms.push(word)
    if (/[\u4e00-\u9fa5]/.test(word) && word.length > 4) {
      for (let index = 0; index <= word.length - 2; index += 1) {
        terms.push(word.slice(index, index + 2))
      }
    }
  }

  return [...new Set(terms)].slice(0, 12)
}

export function isExcludedTerm(term: string): boolean {
  return EXCLUSION_SET.has(term.trim().toLowerCase())
}
