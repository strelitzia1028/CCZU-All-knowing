import { appConfig } from './config.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

interface ModelProfile {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

function requireApiKey(profile: ModelProfile, label: string): string {
  if (!profile.apiKey) {
    throw new Error(`${label} API key is not set`);
  }
  return profile.apiKey;
}

async function requestCompletion(
  profile: ModelProfile,
  label: string,
  messages: LlmMessage[],
  stream: boolean
) {
  const response = await fetch(`${profile.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireApiKey(profile, label)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: profile.model,
      messages,
      stream,
      temperature: profile.temperature,
    }),
    signal: AbortSignal.timeout(profile.timeoutMs),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 800);
    throw new Error(`${label} 请求失败（${response.status}）：${body}`);
  }

  return response;
}

function fallbackTags(question: string): string[] {
  return [
    ...new Set(
      question
        .split(/[\s,，。！？、；：]+/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 2)
    ),
  ].slice(0, 5);
}

const sourceSummaryCache = new Map<
  string,
  { summary: string; expiresAt: number }
>();

const SUMMARY_STOP_WORDS = new Set([
  '用户',
  '需要',
  '希望',
  '信息',
  '内容',
  '发布',
  '想找',
  '寻找',
  '一起',
  '时间',
  '地点',
  '活动',
  '可以',
  '要求',
]);

function summaryGroundingTokens(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:\s]+/g, ' ');
  for (const word of normalized.split(' ').filter(Boolean)) {
    if (word.length >= 2 && !SUMMARY_STOP_WORDS.has(word)) {
      tokens.push(word);
    }
    if (/[\u4e00-\u9fa5]/.test(word)) {
      for (let index = 0; index < word.length - 1; index += 1) {
        const pair = word.slice(index, index + 2);
        if (!SUMMARY_STOP_WORDS.has(pair)) tokens.push(pair);
      }
    }
  }
  return [...new Set(tokens)].slice(0, 50);
}

function isGroundedSummary(summary: string, source: string): boolean {
  const sourceTokens = summaryGroundingTokens(source);
  if (sourceTokens.length === 0) return false;

  const summaryTokens = new Set(summaryGroundingTokens(summary));
  const overlap = sourceTokens.filter((token) =>
    summaryTokens.has(token)
  ).length;
  const requiredOverlap = sourceTokens.length <= 4 ? 1 : 2;
  if (overlap < requiredOverlap) return false;

  const sourceNumbers = new Set(source.match(/\d+/g) || []);
  const unsupportedNumber = (summary.match(/\d+/g) || []).some(
    (number) => !sourceNumbers.has(number)
  );
  return !unsupportedNumber;
}

export async function summarizeSourceContent(
  content: string
): Promise<string> {
  const normalized = content.trim().slice(0, 5000);
  const cached = sourceSummaryCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.summary;

  let summary = normalized.replace(/\s+/g, ' ').slice(0, 300);
  try {
    const response = await requestCompletion(
      appConfig.extractModel,
      '发布需求总结模型',
      [
        {
          role: 'system',
          content:
            '你是校园信息源需求分析器。将用户准备发布的内容总结成一条客观、可分类的中文需求描述。只能复述输入中明确存在的时间、地点、物品、活动、人数、交易或求助对象。不得添加输入中没有的人物、地点、数字或事件，不得输出 Tag 名称或分类解释。只输出一段纯文本，最多 300 字。',
        },
        { role: 'user', content: normalized },
      ],
      false
    );
    const payload = (await response.json()) as ChatCompletionResponse;
    const generated = payload.choices?.[0]?.message?.content
      ?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    if (generated && isGroundedSummary(generated, normalized)) {
      summary = generated;
    } else if (generated) {
      console.warn('Source summary rejected because it was not grounded.');
    }
  } catch (error) {
    console.error('Source summary failed, using fallback:', error);
  }

  if (sourceSummaryCache.size >= 100) {
    const oldestKey = sourceSummaryCache.keys().next().value;
    if (oldestKey) sourceSummaryCache.delete(oldestKey);
  }
  sourceSummaryCache.set(normalized, {
    summary,
    expiresAt: Date.now() + 120_000,
  });
  return summary;
}

export async function extractTags(question: string): Promise<string[]> {
  try {
    const response = await requestCompletion(
      appConfig.extractModel,
      '标签提取模型',
      [
        {
          role: 'system',
          content:
            '你是标签提取器。从用户问题提取 1 到 5 个核心中文标签。只返回 JSON 字符串数组，例如 ["食堂","营业时间"]，不要解释，不要 Markdown。',
        },
        { role: 'user', content: question },
      ],
      false
    );
    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content || '';
    const arrayText = content.match(/\[[\s\S]*\]/)?.[0];
    if (!arrayText) return fallbackTags(question);

    const parsed = JSON.parse(arrayText) as unknown;
    if (!Array.isArray(parsed)) return fallbackTags(question);

    const tags = [
      ...new Set(
        parsed
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0 && value.length <= 20)
      ),
    ].slice(0, 5);

    return tags.length > 0 ? tags : fallbackTags(question);
  } catch (error) {
    console.error('Tag extraction failed, using fallback:', error);
    return fallbackTags(question);
  }
}

export async function suggestTagsFromAllowed(
  content: string,
  allowedTags: Array<{ name: string; description?: string | null }>
): Promise<string[]> {
  const normalizedAllowed = allowedTags
    .map((tag) => ({
      name: tag.name.trim(),
      description: tag.description?.trim() || null,
    }))
    .filter((tag) => tag.name);
  if (normalizedAllowed.length === 0) return [];

  try {
    const summary = await summarizeSourceContent(content);
    const response = await requestCompletion(
      appConfig.extractModel,
      '标签推荐模型',
      [
        {
          role: 'system',
          content:
            '你是校园信息标签分类器。先核对需求总结与每个 Tag 的名称、描述，选择语义真正匹配的 1 到 3 个 Tag。只能从给定列表选择，不得创建新 Tag。只返回 JSON 字符串数组，不要解释，不要 Markdown。',
        },
        {
          role: 'user',
          content: `需求总结：${summary}\n\n可选 Tag（名称与描述）：${JSON.stringify(normalizedAllowed)}`,
        },
      ],
      false
    );
    const payload = (await response.json()) as ChatCompletionResponse;
    const responseText = payload.choices?.[0]?.message?.content || '';
    const arrayText = responseText.match(/\[[\s\S]*\]/)?.[0];
    const parsed = arrayText ? (JSON.parse(arrayText) as unknown) : [];
    const allowedSet = new Set(
      normalizedAllowed.map((tag) => tag.name.toLowerCase())
    );

    if (Array.isArray(parsed)) {
      const selected = [
        ...new Set(
          parsed
            .filter((value): value is string => typeof value === 'string')
            .filter((value) => allowedSet.has(value.toLowerCase()))
        ),
      ].slice(0, 3);
      if (selected.length > 0) return selected;
    }
  } catch (error) {
    console.error('Automatic tag suggestion failed:', error);
  }

  return normalizedAllowed
    .filter(
      (tag) =>
        content.includes(tag.name) ||
        Boolean(tag.description && content.includes(tag.description))
    )
    .map((tag) => tag.name)
    .slice(0, 3);
}

export async function suggestSourceType(
  content: string,
  allowedTypes: Array<{
    value: string;
    label: string;
    description?: string | null;
  }>
): Promise<string | null> {
  if (allowedTypes.length === 0) return null;

  try {
    const summary = await summarizeSourceContent(content);
    const response = await requestCompletion(
      appConfig.extractModel,
      '类型推荐模型',
      [
        {
          role: 'system',
          content:
            '你是校园信息类型分类器。先核对需求总结与每个类型的名称、描述，选择语义最匹配的 1 个类型。只能从给定类型选择，不得创建新类型。只返回 JSON 字符串数组，不要解释，不要 Markdown。',
        },
        {
          role: 'user',
          content: `需求总结：${summary}\n\n可选类型（名称与描述）：${JSON.stringify(
            allowedTypes.map((item) => ({
              label: item.label,
              description: item.description || null,
            }))
          )}`,
        },
      ],
      false
    );
    const payload = (await response.json()) as ChatCompletionResponse;
    const responseText = payload.choices?.[0]?.message?.content || '';
    const arrayText = responseText.match(/\[[\s\S]*\]/)?.[0];
    const parsed = arrayText ? (JSON.parse(arrayText) as unknown) : [];

    if (Array.isArray(parsed)) {
      const selectedLabel = parsed.find(
        (value): value is string => typeof value === 'string'
      );
      const matched = allowedTypes.find(
        (item) =>
          item.label.toLowerCase() === selectedLabel?.toLowerCase()
      );
      if (matched) return matched.value;
    }
  } catch (error) {
    console.error('Automatic source type suggestion failed:', error);
  }

  return (
    allowedTypes.find(
      (item) =>
        content.includes(item.label) ||
        Boolean(item.description && content.includes(item.description))
    )?.value || null
  );
}

export async function* streamChat(
  messages: LlmMessage[]
): AsyncGenerator<string> {
  const response = await requestCompletion(
    appConfig.chatModel,
    '回答模型',
    messages,
    true
  );
  if (!response.body) {
    throw new Error('智谱接口没有返回可读取的数据流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      let payload: {
        choices?: Array<{ delta?: { content?: string | null } }>;
      };
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }

      const content = payload.choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content) {
        yield content;
      }
    }
  }
}

export async function completeChat(messages: LlmMessage[]): Promise<string> {
  const response = await requestCompletion(
    appConfig.chatModel,
    'Agent 规划模型',
    messages,
    false
  );
  const payload = (await response.json()) as ChatCompletionResponse;
  return payload.choices?.[0]?.message?.content?.trim() || '';
}
