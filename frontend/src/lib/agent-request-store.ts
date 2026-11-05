import type {
  AgentDraft,
  AgentTraceStep,
  CommunitySourceResult,
  CreatedCatalogRequest,
  RetrievalSource,
} from '@cczu/shared';
import { apiFetch } from '@/lib/api';

export type AgentRequestPhase = 'running' | 'completed' | 'error';

export interface AgentRequestSnapshot {
  requestId: string;
  userId: string;
  userMessageId: string;
  assistantMessageId: string;
  message: string;
  sessionId: string | null;
  content: string;
  category?: string;
  extractedTags: string[];
  sources: RetrievalSource[];
  communitySources: CommunitySourceResult[];
  agentTrace: AgentTraceStep[];
  draft: AgentDraft | null;
  catalogRequests: CreatedCatalogRequest[];
  phase: AgentRequestPhase;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

interface StartAgentRequestOptions {
  userId: string;
  userMessageId: string;
  assistantMessageId: string;
  message: string;
  sessionId: string | null;
  history: Array<{
    message_id: string;
    role: 'user' | 'assistant';
    content: string;
    draft: AgentDraft | null;
    draft_source_id: string | null;
    draft_status: string | null;
  }>;
}

type AgentRequestListener = (snapshot: AgentRequestSnapshot) => void;

const activeRequests = new Map<string, AgentRequestSnapshot>();
const listeners = new Map<string, Set<AgentRequestListener>>();

function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `request-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function storageKey(userId: string) {
  return `cczu_active_agent_request:${userId}`;
}

function writeSnapshot(snapshot: AgentRequestSnapshot) {
  try {
    window.localStorage.setItem(
      storageKey(snapshot.userId),
      JSON.stringify(snapshot)
    );
  } catch {
    // In-memory continuation still works when storage is unavailable.
  }
}

function publish(snapshot: AgentRequestSnapshot) {
  activeRequests.set(snapshot.userId, snapshot);
  writeSnapshot(snapshot);
  for (const listener of listeners.get(snapshot.userId) || []) {
    listener(snapshot);
  }
}

export function loadAgentRequest(
  userId: string
): AgentRequestSnapshot | null {
  const inMemory = activeRequests.get(userId);
  if (inMemory) return inMemory;

  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as AgentRequestSnapshot;
    if (snapshot.phase === 'running') {
      const interrupted: AgentRequestSnapshot = {
        ...snapshot,
        phase: 'error',
        error: '请求因页面刷新已中断，请重新发送。',
        updatedAt: Date.now(),
      };
      writeSnapshot(interrupted);
      return interrupted;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function subscribeAgentRequest(
  userId: string,
  listener: AgentRequestListener
) {
  let userListeners = listeners.get(userId);
  if (!userListeners) {
    userListeners = new Set();
    listeners.set(userId, userListeners);
  }
  userListeners.add(listener);

  const current = loadAgentRequest(userId);
  if (current) listener(current);

  return () => {
    userListeners?.delete(listener);
    if (userListeners?.size === 0) listeners.delete(userId);
  };
}

export function clearAgentRequest(userId: string) {
  activeRequests.delete(userId);
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

function parseSseLines(
  buffer: string
): { events: Array<Record<string, unknown>>; rest: string } {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() || '';
  const events: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    try {
      events.push(
        JSON.parse(line.slice(5).trim()) as Record<string, unknown>
      );
    } catch {
      // Skip malformed events.
    }
  }
  return { events, rest };
}

export async function startAgentRequest(options: StartAgentRequestOptions) {
  const now = Date.now();
  let snapshot: AgentRequestSnapshot = {
    requestId: createRequestId(),
    userId: options.userId,
    userMessageId: options.userMessageId,
    assistantMessageId: options.assistantMessageId,
    message: options.message,
    sessionId: options.sessionId,
    content: '',
    extractedTags: [],
    sources: [],
    communitySources: [],
    agentTrace: [],
    draft: null,
    catalogRequests: [],
    phase: 'running',
    startedAt: now,
    updatedAt: now,
  };
  publish(snapshot);

  try {
    const response = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: options.message,
        session_id: options.sessionId,
        history: options.history,
      }),
    });
    if (!response.ok) {
      let detail = `Agent 请求失败（${response.status}）`;
      try {
        const errorBody = await response.json();
        if (typeof errorBody?.error === 'string') detail = errorBody.error;
      } catch {
        // Keep the status-based error.
      }
      throw new Error(detail);
    }
    if (!response.body) throw new Error('Agent 没有返回数据流');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseLines(buffer);
      buffer = parsed.rest;

      for (const event of parsed.events) {
        if (
          event.type === 'started' &&
          typeof event.session_id === 'string'
        ) {
          snapshot = {
            ...snapshot,
            sessionId: event.session_id,
            updatedAt: Date.now(),
          };
          publish(snapshot);
        } else if (
          event.type === 'agent_trace' &&
          event.step &&
          typeof event.step === 'object'
        ) {
          const step = event.step as AgentTraceStep;
          const trace = [...snapshot.agentTrace];
          const index = trace.findIndex((item) => item.id === step.id);
          if (index >= 0) trace[index] = step;
          else trace.push(step);
          snapshot = {
            ...snapshot,
            agentTrace: trace,
            updatedAt: Date.now(),
          };
          publish(snapshot);
        } else if (event.type === 'metadata') {
          snapshot = {
            ...snapshot,
            category:
              typeof event.category === 'string'
                ? event.category
                : snapshot.category,
            extractedTags: Array.isArray(event.extracted_tags)
              ? (event.extracted_tags as string[])
              : [],
            sources: Array.isArray(event.sources)
              ? (event.sources as RetrievalSource[])
              : [],
            communitySources: Array.isArray(event.community_sources)
              ? (event.community_sources as CommunitySourceResult[])
              : [],
            agentTrace: Array.isArray(event.agent_trace)
              ? (event.agent_trace as AgentTraceStep[])
              : snapshot.agentTrace,
            draft:
              event.draft && typeof event.draft === 'object'
                ? (event.draft as AgentDraft)
                : null,
            catalogRequests: Array.isArray(event.catalog_requests)
              ? (event.catalog_requests as CreatedCatalogRequest[])
              : [],
            updatedAt: Date.now(),
          };
          publish(snapshot);
        } else if (
          event.type === 'chunk' &&
          typeof event.content === 'string'
        ) {
          snapshot = {
            ...snapshot,
            content: snapshot.content + event.content,
            updatedAt: Date.now(),
          };
          publish(snapshot);
        } else if (event.type === 'error') {
          throw new Error(
            typeof event.error === 'string'
              ? event.error
              : 'Agent 执行失败'
          );
        }
      }
    }

    snapshot = {
      ...snapshot,
      phase: 'completed',
      updatedAt: Date.now(),
    };
    publish(snapshot);
  } catch (error) {
    snapshot = {
      ...snapshot,
      phase: 'error',
      error:
        error instanceof Error ? error.message : '网络请求失败，请重试。',
      updatedAt: Date.now(),
    };
    publish(snapshot);
  }
}
