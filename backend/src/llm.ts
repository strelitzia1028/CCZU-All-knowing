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
