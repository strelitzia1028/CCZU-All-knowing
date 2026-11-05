'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileText,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wrench,
} from 'lucide-react';
import type {
  AgentDraft,
  AgentTraceStep,
  CommunitySourceResult,
  CreatedCatalogRequest,
  RetrievalSource,
} from '@cczu/shared';
import { cn } from '@/lib/utils';
import { useApp } from '@/components/app-provider';
import { apiFetch } from '@/lib/api';
import {
  clearAgentRequest,
  loadAgentRequest,
  startAgentRequest,
  subscribeAgentRequest,
  type AgentRequestSnapshot,
} from '@/lib/agent-request-store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type DraftStatus =
  | 'proposed'
  | 'saving'
  | 'saved'
  | 'submitting'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'syncing'
  | 'sync_failed'
  | 'deleted'
  | 'abandoned';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  category?: string;
  extractedTags?: string[];
  sources?: RetrievalSource[];
  communitySources?: CommunitySourceResult[];
  agentTrace?: AgentTraceStep[];
  draft?: AgentDraft | null;
  draftStatus?: DraftStatus;
  draftSourceId?: string;
  draftActionError?: string;
  draftSuperseded?: boolean;
  catalogRequests?: CreatedCatalogRequest[];
  cardsRevealPlayed?: boolean;
  isStreaming?: boolean;
}

const SOURCE_LEVEL_LABELS: Record<string, string> = {
  official: '官方',
  admin_reviewed: '管理员审核',
  user_share: '用户分享',
};

const QUICK_PROMPTS = [
  '帮我找明晚打羽毛球的搭子',
  '本周有什么校园活动',
  '食堂有什么推荐',
  '发布一个二手自行车的需求',
];

function getRunningTraceStep(message: Message) {
  return message.agentTrace?.find((step) => step.status === 'running');
}

type PostAnswerCard = 'tags' | 'community' | 'knowledge' | 'draft';

function getPostAnswerCards(message: Message): PostAnswerCard[] {
  if (
    message.role !== 'assistant' ||
    message.category === 'smalltalk' ||
    !message.content
  ) {
    return [];
  }
  const cards: PostAnswerCard[] = [];
  if (message.extractedTags?.length) cards.push('tags');
  cards.push('community');
  cards.push('knowledge');
  if (message.draft) cards.push('draft');
  return cards;
}

function getPostAnswerCardDelay(message: Message, card: PostAnswerCard) {
  const index = getPostAnswerCards(message).indexOf(card);
  return `${Math.max(0, index) * 260}ms`;
}

function applyAgentSnapshotToMessages(
  previous: Message[],
  snapshot: AgentRequestSnapshot
): Message[] {
  let next = [...previous];
  const revisionId = snapshot.draft?.revision_of_message_id;
  if (revisionId) {
    next = next.map((message) =>
      message.id === revisionId
        ? { ...message, draftSuperseded: true }
        : message
    );
  }

  if (!next.some((message) => message.id === snapshot.userMessageId)) {
    next.push({
      id: snapshot.userMessageId,
      role: 'user',
      content: snapshot.message,
    });
  }

  const assistantIndex = next.findIndex(
    (message) => message.id === snapshot.assistantMessageId
  );
  const existing =
    assistantIndex >= 0 ? next[assistantIndex] : undefined;
  const fallbackContent =
    snapshot.error || '网络请求失败，请稍后重试。';
  const assistant: Message = {
    ...(existing || {
      id: snapshot.assistantMessageId,
      role: 'assistant',
      content: '',
    }),
    content:
      snapshot.content ||
      (snapshot.phase === 'error' ? fallbackContent : ''),
    category: snapshot.category,
    extractedTags: snapshot.extractedTags,
    sources: snapshot.sources,
    communitySources: snapshot.communitySources,
    agentTrace: snapshot.agentTrace,
    draft: snapshot.draft,
    draftStatus: snapshot.draft
      ? existing?.draftStatus && existing.draftStatus !== 'syncing'
        ? existing.draftStatus
        : 'proposed'
      : existing?.draftStatus,
    catalogRequests: snapshot.catalogRequests,
    isStreaming: snapshot.phase === 'running',
  };

  if (assistantIndex >= 0) next[assistantIndex] = assistant;
  else next.push(assistant);
  return next;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN');
}

function isExpired(value: string) {
  return (
    (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24) >
    90
  );
}

const CHAT_STORAGE_VERSION = 1;

interface StoredConversation {
  version: number;
  messages: Message[];
  sessionId: string | null;
}

function getChatStorageKey(userId: string) {
  return `cczu_chat_history_v${CHAT_STORAGE_VERSION}:${userId}`;
}

function normalizeDraftStatus(status: unknown): DraftStatus | undefined {
  if (status === 'saving') return 'proposed';
  if (status === 'submitting') return 'saved';
  return status === 'proposed' ||
    status === 'saved' ||
    status === 'submitted' ||
    status === 'approved' ||
    status === 'rejected' ||
    status === 'syncing' ||
    status === 'sync_failed' ||
    status === 'deleted' ||
    status === 'abandoned'
    ? status
    : undefined;
}

function sourceStatusToDraftStatus(status: unknown): DraftStatus {
  if (status === 'pending') return 'submitted';
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'saved';
}

function isRemovedDraft(status: DraftStatus | undefined) {
  return status === 'deleted' || status === 'abandoned';
}

function getDraftCardPresentation(message: Message) {
  const status = message.draftStatus;
  if (status === 'deleted') {
    return {
      label: '信息源已删除',
      border: 'border-red-200',
      header: 'bg-red-50 text-red-700',
    };
  }
  if (status === 'abandoned') {
    return {
      label: '草稿已放弃',
      border: 'border-red-200',
      header: 'bg-red-50 text-red-700',
    };
  }
  if (status === 'rejected') {
    return {
      label: '审核未通过',
      border: 'border-red-200',
      header: 'bg-red-50 text-red-700',
    };
  }
  if (status === 'approved') {
    return {
      label: '已通过管理员审核',
      border: 'border-emerald-200',
      header: 'bg-emerald-50 text-emerald-700',
    };
  }
  if (status === 'submitted') {
    return {
      label: '已提交管理员审核',
      border: 'border-emerald-200',
      header: 'bg-emerald-50 text-emerald-700',
    };
  }
  if (status === 'saved') {
    return {
      label: '草稿已保存',
      border: 'border-amber-200',
      header: 'bg-amber-50 text-amber-800',
    };
  }
  if (status === 'syncing') {
    return {
      label: '正在同步信息源状态',
      border: 'border-slate-200',
      header: 'bg-slate-50 text-slate-600',
    };
  }
  if (status === 'sync_failed') {
    return {
      label: '状态同步失败，请刷新页面',
      border: 'border-red-200',
      header: 'bg-red-50 text-red-700',
    };
  }
  if (message.draftSuperseded) {
    return {
      label: '此草稿已被后续修订替代',
      border: 'border-slate-200',
      header: 'bg-slate-50 text-slate-500',
    };
  }
  if (message.draft?.revision_of_message_id) {
    return {
      label: 'Agent 已更新上一份草稿',
      border: 'border-amber-300',
      header: 'bg-amber-50 text-amber-800',
    };
  }
  return {
    label: 'Agent 草稿 · 尚未写入数据库',
    border: 'border-amber-300',
    header: 'bg-amber-50 text-amber-800',
  };
}

function readStoredConversation(userId: string): StoredConversation | null {
  try {
    const raw = window.localStorage.getItem(getChatStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConversation>;
    if (
      parsed.version !== CHAT_STORAGE_VERSION ||
      !Array.isArray(parsed.messages)
    ) {
      return null;
    }

    const messages = parsed.messages
      .filter(
        (message): message is Message =>
          Boolean(
            message &&
              typeof message.id === 'string' &&
              (message.role === 'user' || message.role === 'assistant') &&
              typeof message.content === 'string'
          )
      )
      .map((message) => ({
        ...message,
        isStreaming: false,
        cardsRevealPlayed: true,
        draftStatus: message.draftSourceId
          ? 'syncing'
          : normalizeDraftStatus(message.draftStatus),
      }));

    return {
      version: CHAT_STORAGE_VERSION,
      messages,
      sessionId:
        typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
    };
  } catch {
    return null;
  }
}

function writeStoredConversation(
  userId: string,
  messages: Message[],
  sessionId: string | null
) {
  try {
    const conversation: StoredConversation = {
      version: CHAT_STORAGE_VERSION,
      messages,
      sessionId,
    };
    window.localStorage.setItem(
      getChatStorageKey(userId),
      JSON.stringify(conversation)
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export default function ChatPage() {
  const { user, isLoading: authLoading } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [selectedCommunitySource, setSelectedCommunitySource] =
    useState<CommunitySourceResult | null>(null);
  const [communityDetailOpen, setCommunityDetailOpen] = useState(false);
  const historyOwnerRef = useRef<string | null>(null);
  const syncedDraftMessageIdsRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (authLoading) {
      historyOwnerRef.current = null;
      setHistoryReady(false);
      return;
    }

    historyOwnerRef.current = null;
    syncedDraftMessageIdsRef.current = new Set();
    setHistoryReady(false);
    setClearDialogOpen(false);

    if (!user) {
      setMessages([]);
      setSessionId(null);
      setIsLoading(false);
      setHistoryReady(true);
      return;
    }

    const stored = readStoredConversation(user.id);
    const activeRequest = loadAgentRequest(user.id);
    const restoredMessages = stored?.messages || [];
    const mergedMessages = activeRequest
      ? applyAgentSnapshotToMessages(restoredMessages, activeRequest)
      : restoredMessages;
    setMessages(mergedMessages);
    setSessionId(activeRequest?.sessionId || stored?.sessionId || null);
    setIsLoading(activeRequest?.phase === 'running');
    historyOwnerRef.current = user.id;
    setHistoryReady(true);
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;

    return subscribeAgentRequest(user.id, (snapshot) => {
      setSessionId(snapshot.sessionId);
      setMessages((previous) =>
        applyAgentSnapshotToMessages(previous, snapshot)
      );
      setIsLoading(snapshot.phase === 'running');
    });
  }, [user]);

  const hasStreamingMessage = messages.some(
    (message) => message.isStreaming
  );

  useEffect(() => {
    if (!historyReady || hasStreamingMessage) return;

    const pending = messages.filter(
      (message) =>
        !message.cardsRevealPlayed &&
        !message.isStreaming &&
        getPostAnswerCards(message).length > 0
    );
    if (pending.length === 0) return;

    const maxAnimationTime = Math.max(
      ...pending.map((message) => {
        const cardCount = getPostAnswerCards(message).length;
        return Math.max(0, cardCount - 1) * 260 + 300;
      })
    );
    const timer = window.setTimeout(() => {
      const pendingIds = new Set(pending.map((message) => message.id));
      setMessages((previous) =>
        previous.map((message) =>
          pendingIds.has(message.id)
            ? { ...message, cardsRevealPlayed: true }
            : message
        )
      );
    }, maxAnimationTime);

    return () => window.clearTimeout(timer);
  }, [hasStreamingMessage, historyReady, messages]);

  useEffect(() => {
    if (authLoading || !historyReady || !user || hasStreamingMessage) {
      return;
    }

    const candidates = messages.filter(
      (message) =>
        Boolean(message.draftSourceId) &&
        !syncedDraftMessageIdsRef.current.has(message.id)
    );
    if (candidates.length === 0) return;

    for (const message of candidates) {
      syncedDraftMessageIdsRef.current.add(message.id);
    }

    void Promise.all(
      candidates.map(async (message) => {
        try {
          const response = await apiFetch(
            `/api/sources/${message.draftSourceId}`
          );
          if (response.status === 404) {
            return {
              messageId: message.id,
              status: 'deleted' as DraftStatus,
              error: undefined,
            };
          }
          if (!response.ok) {
            throw new Error('无法同步信息源状态');
          }
          const data = await response.json();
          return {
            messageId: message.id,
            status: sourceStatusToDraftStatus(data.data?.status),
            error: undefined,
          };
        } catch {
          return {
            messageId: message.id,
            status: 'sync_failed' as DraftStatus,
            error: '无法同步信息源状态，请刷新页面重试',
          };
        }
      })
    ).then((updates) => {
      const updateMap = new Map(
        updates.map((update) => [update.messageId, update])
      );
      setMessages((previous) =>
        previous.map((message) => {
          const update = updateMap.get(message.id);
          return update
            ? {
                ...message,
                draftStatus: update.status,
                draftActionError: update.error,
              }
            : message;
        })
      );
    });
  }, [authLoading, hasStreamingMessage, historyReady, messages, user]);

  useEffect(() => {
    if (
      authLoading ||
      !historyReady ||
      !user ||
      historyOwnerRef.current !== user.id ||
      hasStreamingMessage
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      writeStoredConversation(user.id, messages, sessionId);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    authLoading,
    hasStreamingMessage,
    historyReady,
    messages,
    sessionId,
    user,
  ]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (
        !user ||
        !historyReady ||
        historyOwnerRef.current !== user.id ||
        hasStreamingMessage
      ) {
        return;
      }
      writeStoredConversation(user.id, messages, sessionId);
    };

    window.addEventListener('pagehide', saveBeforeLeaving);
    return () => window.removeEventListener('pagehide', saveBeforeLeaving);
  }, [hasStreamingMessage, historyReady, messages, sessionId, user]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || isLoading || !user) return;

    const timestamp = Date.now();
    const userMessage: Message = {
      id: `user-${timestamp}`,
      role: 'user',
      content: text,
    };
    const assistantMessage: Message = {
      id: `assistant-${timestamp}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      cardsRevealPlayed: false,
    };
    const history = messages
      .filter((message) => !message.draftSuperseded)
      .slice(-12)
      .map((message) => ({
        message_id: message.id,
        role: message.role,
        content: message.content,
        draft: message.draft || null,
        draft_source_id: message.draftSourceId || null,
        draft_status: message.draftStatus || null,
      }));
    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    writeStoredConversation(user.id, nextMessages, sessionId);
    setInput('');
    setIsLoading(true);

    void startAgentRequest({
      userId: user.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      message: text,
      sessionId,
      history,
    });
  };

  const updateDraftMessage = (
    messageId: string,
    update: Partial<Message>
  ) => {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === messageId
          ? { ...message, ...update }
          : message
      )
    );
  };

  const saveDraft = async (message: Message) => {
    if (!message.draft || message.draftStatus !== 'proposed') return;
    updateDraftMessage(message.id, {
      draftStatus: 'saving',
      draftActionError: undefined,
    });

    try {
      const existingSourceId = message.draft.source_id;
      const response = await apiFetch(
        existingSourceId
          ? `/api/sources/${existingSourceId}`
          : '/api/sources',
        {
        method: existingSourceId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: message.draft.title,
          content: message.draft.content,
          type: message.draft.type,
          location: message.draft.location,
          contact_mode: 'platform',
          tag_ids: message.draft.tag_ids,
        }),
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error || '保存草稿失败');
      }
      updateDraftMessage(message.id, {
        draftStatus: 'saved',
        draftSourceId: existingSourceId || body.data.id,
      });
    } catch (error) {
      updateDraftMessage(message.id, {
        draftStatus: 'proposed',
        draftActionError:
          error instanceof Error ? error.message : '保存草稿失败',
      });
    }
  };

  const submitDraft = async (message: Message) => {
    if (
      !message.draftSourceId ||
      message.draftStatus !== 'saved'
    ) {
      return;
    }
    updateDraftMessage(message.id, {
      draftStatus: 'submitting',
      draftActionError: undefined,
    });

    try {
      const response = await apiFetch(
        `/api/sources/${message.draftSourceId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pending' }),
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error || '提交审核失败');
      }
      updateDraftMessage(message.id, { draftStatus: 'submitted' });
    } catch (error) {
      updateDraftMessage(message.id, {
        draftStatus: 'saved',
        draftActionError:
          error instanceof Error ? error.message : '提交审核失败',
      });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const clearConversation = () => {
    if (user) {
      clearAgentRequest(user.id);
      try {
        window.localStorage.removeItem(getChatStorageKey(user.id));
      } catch {
        // The in-memory conversation can still be cleared.
      }
    }
    setMessages([]);
    setSessionId(null);
    setInput('');
    setClearDialogOpen(false);
  };

  const openCommunitySourceDetail = (source: CommunitySourceResult) => {
    setSelectedCommunitySource(source);
    setCommunityDetailOpen(true);
  };

  const inputDisabled = isLoading || authLoading || !user;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-slate-50">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-4xl space-y-7">
          {messages.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setClearDialogOpen(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                title="清空当前设备上的对话记录"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空对话
              </button>
            </div>
          )}

          {messages.length === 0 && (
            <div className="mx-auto max-w-2xl py-12 text-center sm:py-20">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                <Bot className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                CCZU All-knowing
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                不只回答问题。我会检索知识库和社区信息，并在你确认后准备信息源草稿。
              </p>

              <div className="mt-7 grid gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                  >
                    <Search className="h-4 w-4 shrink-0 text-blue-500" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>

              {!authLoading && !user && (
                <p className="mt-6 text-sm text-amber-700">
                  请先登录，Agent 才能安全地使用你的身份执行操作。
                </p>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.role === 'user'
                  ? 'justify-end'
                  : 'justify-start'
              )}
            >
              {message.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm leading-6 text-white shadow-sm">
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ) : (
                <div className="w-full max-w-3xl space-y-3">
                  {message.agentTrace &&
                    message.agentTrace.length > 0 && (
                      <details
                        open={Boolean(getRunningTraceStep(message))}
                        className={cn(
                          'group rounded-lg border bg-white transition-colors',
                          getRunningTraceStep(message)
                            ? 'border-blue-200'
                            : 'border-slate-200'
                        )}
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600">
                          <span className="flex items-center gap-2 font-medium">
                            {getRunningTraceStep(message) ? (
                              <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
                            ) : (
                              <Wrench className="h-4 w-4 text-blue-600" />
                            )}
                            {getRunningTraceStep(message)
                              ? `正在调用：${getRunningTraceStep(message)?.label}`
                              : `Agent 已调用 ${message.agentTrace.length} 个工具`}
                          </span>
                          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                        </summary>
                        <div className="border-t border-slate-100 px-4 py-3">
                          <div className="space-y-3">
                            {message.agentTrace.map((step) => (
                              <div
                                key={step.id}
                                className="flex gap-3 text-xs"
                              >
                                {step.status === 'completed' ? (
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                ) : step.status === 'running' ? (
                                  <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />
                                ) : (
                                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                )}
                                <div className="min-w-0">
                                  <div className="font-medium text-slate-700">
                                    {step.label}
                                    {step.status !== 'running' && (
                                      <span className="ml-2 font-normal text-slate-400">
                                        {step.duration_ms}ms
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 leading-5 text-slate-500">
                                    {step.summary}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                    )}

                  {(message.content || message.isStreaming) && (
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      {message.content ? (
                        <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                          {message.content}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Sparkles className="h-4 w-4 animate-pulse text-blue-500" />
                          Agent 正在思考并执行工具...
                        </div>
                      )}
                    </div>
                  )}

                  {!message.isStreaming &&
                    message.extractedTags &&
                    message.extractedTags.length > 0 && (
                      <div
                        className={cn(
                          'flex flex-wrap items-center gap-1.5',
                          !message.cardsRevealPlayed &&
                            'cczu-answer-card-reveal'
                        )}
                        style={
                          message.cardsRevealPlayed
                            ? undefined
                            : {
                                animationDelay: getPostAnswerCardDelay(
                                  message,
                                  'tags'
                                ),
                              }
                        }
                      >
                        <Tag className="h-3.5 w-3.5 text-slate-400" />
                        {message.extractedTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                  {!message.isStreaming &&
                    message.category !== 'smalltalk' &&
                    message.content && (
                      <div
                        className={cn(
                          'rounded-lg border border-slate-200 bg-white',
                          !message.cardsRevealPlayed &&
                            'cczu-answer-card-reveal'
                        )}
                        style={
                          message.cardsRevealPlayed
                            ? undefined
                            : {
                                animationDelay: getPostAnswerCardDelay(
                                  message,
                                  'community'
                                ),
                              }
                        }
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <Search className="h-4 w-4 text-emerald-600" />
                            匹配到的社区信息源（
                            {message.communitySources?.length || 0} 条）
                          </span>
                          <Link
                            href="/sources/"
                            prefetch={false}
                            className="text-xs text-blue-600 hover:text-blue-700"
                          >
                            前往信息源
                          </Link>
                        </div>
                        {message.communitySources &&
                        message.communitySources.length > 0 ? (
                          <div className="divide-y divide-slate-100">
                            {message.communitySources.map((source) => (
                            <button
                              key={source.id}
                              type="button"
                              onClick={() =>
                                openCommunitySourceDetail(source)
                              }
                              className="group w-full px-4 py-3 text-left transition-colors duration-200 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                                  {source.type_label}
                                </span>
                                <span className="text-sm font-medium text-slate-800 transition-colors group-hover:text-blue-700">
                                  {source.title}
                                </span>
                                <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
                              </div>
                              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                                {source.excerpt}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                                <span>{source.author}</span>
                                <span>{formatDate(source.created_at)}</span>
                                {source.location && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {source.location}
                                  </span>
                                )}
                              </div>
                            </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-sm text-slate-400">
                            没有符合要求的信息源
                          </div>
                        )}
                      </div>
                    )}

                  {!message.isStreaming &&
                    message.category !== 'smalltalk' &&
                    message.content && (
                    (message.sources?.length || 0) > 0 ? (
                    <details
                      className={cn(
                        'group rounded-lg border border-slate-200 bg-white',
                        !message.cardsRevealPlayed &&
                          'cczu-answer-card-reveal'
                      )}
                      style={
                        message.cardsRevealPlayed
                          ? undefined
                          : {
                              animationDelay: getPostAnswerCardDelay(
                                message,
                                'knowledge'
                              ),
                            }
                      }
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-700">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-indigo-600" />
                          知识库依据（{message.sources?.length || 0} 条）
                        </span>
                        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                      </summary>
                      <div className="space-y-3 border-t border-slate-100 px-4 py-4">
                        {(message.sources || []).map((source) => (
                          <div key={source.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-slate-700">
                                {source.title}
                              </span>
                              {isExpired(source.updated_at) && (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                                  可能过期
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                              <span>
                                {SOURCE_LEVEL_LABELS[source.source_level] ||
                                  source.source_level}
                              </span>
                              <span>Tag 匹配 {source.tag_match}%</span>
                              <span>综合匹配 {source.overall_match}%</span>
                              <span>{formatDate(source.updated_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                    ) : (
                      <div
                        className={cn(
                          'rounded-lg border border-slate-200 bg-white',
                          !message.cardsRevealPlayed &&
                            'cczu-answer-card-reveal'
                        )}
                        style={
                          message.cardsRevealPlayed
                            ? undefined
                            : {
                                animationDelay: getPostAnswerCardDelay(
                                  message,
                                  'knowledge'
                                ),
                              }
                        }
                      >
                        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
                          <FileText className="h-4 w-4 text-indigo-600" />
                          知识库依据（0 条）
                        </div>
                        <div className="px-4 py-6 text-center text-sm text-slate-400">
                          没有相关知识库依据
                        </div>
                      </div>
                    )
                  )}

                  {!message.isStreaming && message.draft && (
                    <div
                      className={cn(
                        'overflow-hidden rounded-lg border bg-white shadow-sm',
                        !message.cardsRevealPlayed &&
                          'cczu-answer-card-reveal',
                        getDraftCardPresentation(message).border,
                        message.draftSuperseded &&
                          !isRemovedDraft(message.draftStatus) &&
                          'opacity-70'
                      )}
                      style={
                        message.cardsRevealPlayed
                          ? undefined
                          : {
                              animationDelay: getPostAnswerCardDelay(
                                message,
                                'draft'
                              ),
                            }
                      }
                    >
                      <div
                        className={cn(
                          'flex items-center gap-2 px-4 py-3 text-sm font-medium',
                          getDraftCardPresentation(message).header
                        )}
                      >
                        <Sparkles className="h-4 w-4" />
                        {getDraftCardPresentation(message).label}
                      </div>
                      <div className="space-y-3 px-4 py-4">
                        <div>
                          <div className="text-base font-semibold text-slate-900">
                            {message.draft.title}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                            {message.draft.content}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                            {message.draft.type_label}
                          </span>
                          {message.draft.location && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-slate-600">
                              <MapPin className="h-3 w-3" />
                              {message.draft.location}
                            </span>
                          )}
                          {message.draft.tag_names.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-slate-100 px-2 py-1 text-slate-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {message.catalogRequests &&
                          message.catalogRequests.length > 0 && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                              已提交管理员审核：
                              {message.catalogRequests
                                .map(
                                  (request) =>
                                    `${request.request_type === 'tag' ? 'Tag' : '类型'}「${request.name}」`
                                )
                                .join('、')}
                            </div>
                          )}

                        {message.draftActionError && (
                          <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">
                            {message.draftActionError}
                          </p>
                        )}

                        {message.draftStatus === 'proposed' &&
                          !message.draftSuperseded && (
                          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => void saveDraft(message)}
                              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              <Check className="h-3.5 w-3.5" />
                              保存为草稿
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftMessage(message.id, {
                                  draftStatus: 'abandoned',
                                  draftActionError: undefined,
                                })
                              }
                              className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              放弃
                            </button>
                          </div>
                        )}

                        {message.draftStatus === 'saving' && (
                          <p className="text-xs text-blue-600">
                            正在保存草稿...
                          </p>
                        )}

                        {message.draftStatus === 'saved' &&
                          !message.draftSuperseded && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              草稿已保存
                            </span>
                            <button
                              type="button"
                              onClick={() => void submitDraft(message)}
                              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              提交管理员审核
                            </button>
                          </div>
                        )}

                        {message.draftStatus === 'submitting' && (
                          <p className="text-xs text-emerald-700">
                            正在提交审核...
                          </p>
                        )}

                        {message.draftStatus === 'submitted' && (
                          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            已提交审核，管理员通过后会出现在信息源广场。
                          </div>
                        )}

                        {message.draftStatus === 'approved' && (
                          <div className="flex items-center gap-2 border-t border-emerald-100 pt-3 text-xs text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            信息源已通过管理员审核。
                          </div>
                        )}

                        {message.draftStatus === 'rejected' && (
                          <div className="flex items-center gap-2 border-t border-red-100 pt-3 text-xs text-red-700">
                            <CircleAlert className="h-4 w-4" />
                            信息源审核未通过，可回到信息源页面查看原因。
                          </div>
                        )}

                        {message.draftStatus === 'deleted' && (
                          <div className="flex items-center gap-2 border-t border-red-100 pt-3 text-xs text-red-700">
                            <Trash2 className="h-4 w-4" />
                            对应的信息源已被删除。
                          </div>
                        )}

                        {message.draftStatus === 'abandoned' && (
                          <div className="flex items-center gap-2 border-t border-red-100 pt-3 text-xs text-red-700">
                            <Trash2 className="h-4 w-4" />
                            此草稿已由用户放弃。
                          </div>
                        )}

                        {message.draftStatus === 'syncing' && (
                          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                            <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
                            正在同步信息源状态...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !authLoading && !user
                ? '登录后即可使用 Agent'
                : '描述你的校园生活需求...'
            }
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            rows={1}
            disabled={inputDisabled}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={inputDisabled || !input.trim()}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition',
              inputDisabled || !input.trim()
                ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
            aria-label="发送消息"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>

      <Dialog
        open={communityDetailOpen}
        onOpenChange={(open) => {
          if (!open) setCommunityDetailOpen(false);
        }}
      >
        <DialogContent
          className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-3xl"
          onAnimationEnd={(event) => {
            if (event.animationName === 'cczu-dialog-content-out') {
              setSelectedCommunitySource(null);
            }
          }}
        >
          {selectedCommunitySource && (
            <>
              <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-14">
                <span className="w-fit rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                  {selectedCommunitySource.type_label}
                </span>
                <DialogTitle className="mt-2 text-xl leading-7 text-slate-900">
                  {selectedCommunitySource.title}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span>{selectedCommunitySource.author}</span>
                  <span>
                    发布于{' '}
                    {formatDate(selectedCommunitySource.created_at)}
                  </span>
                  {selectedCommunitySource.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedCommunitySource.location}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 px-6 py-5">
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {selectedCommunitySource.content}
                </div>
                {selectedCommunitySource.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {selectedCommunitySource.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Trash2 className="h-5 w-5 text-red-600" />
              清空全部对话？
            </DialogTitle>
            <DialogDescription className="leading-6">
              将删除当前浏览器中保存的对话、回答和 Agent
              结果。此操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setClearDialogOpen(false)}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
            >
              取消
            </button>
            <button
              type="button"
              onClick={clearConversation}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              确认清空
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
