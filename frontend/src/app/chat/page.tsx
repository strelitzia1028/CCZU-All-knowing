'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface Source {
  id: string;
  title: string;
  source_level: string;
  updated_at: string;
  tag_match: number;
  overall_match: number;
  tags: { id: string; name: string }[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  category?: string;
  extractedTags?: string[];
  sources?: Source[];
  isStreaming?: boolean;
}

const SOURCE_LEVEL_LABELS: Record<string, string> = {
  official: '官方',
  admin_reviewed: '管理员审核',
  user_share: '用户分享',
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'overall_match' | 'tag_match'>('overall_match');
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const assistantMsg: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });

      if (!response.ok) {
        let detail = `请求失败（${response.status}）`;
        try {
          const errorBody = await response.json();
          if (typeof errorBody?.error === 'string' && errorBody.error) {
            detail = errorBody.error;
          }
        } catch {
          // Keep the status-based message when the response is not JSON.
        }
        throw new Error(detail);
      }
      if (!response.body) throw new Error('无响应流');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentContent = '';
      let currentSources: Source[] = [];
      let currentCategory = '';
      let currentTags: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'metadata') {
              setSessionId(data.session_id);
              currentSources = data.sources || [];
              currentCategory = data.category;
              currentTags = Array.isArray(data.extracted_tags)
                ? data.extracted_tags
                : [];
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.sources = currentSources;
                  last.category = currentCategory;
                  last.extractedTags = currentTags;
                }
                return updated;
              });
            } else if (data.type === 'chunk') {
              currentContent += data.content;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.content = currentContent;
                }
                return updated;
              });
            } else if (data.type === 'done') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.isStreaming = false;
                }
                return updated;
              });
            } else if (data.type === 'error') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.content = `出错了：${data.error}`;
                  last.isStreaming = false;
                }
                return updated;
              });
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          last.content =
            error instanceof Error && error.message
              ? `请求失败：${error.message}`
              : '网络请求失败，请重试。';
          last.isStreaming = false;
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleSourceExpand = (msgId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const sortedSources = (sources: Source[]) => {
    return [...sources].sort((a, b) => {
      if (sortBy === 'tag_match') {
        return b.tag_match - a.tag_match || b.overall_match - a.overall_match;
      }
      return b.overall_match - a.overall_match || b.tag_match - a.tag_match;
    });
  };

  const isExpired = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 90;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">🎓</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                常大西太湖校区生活助手
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                你的热心学长/学姐，帮你解答校区生活问题
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {['一食堂几点开门', '图书馆自习室在哪', '找搭子规则', '周边有什么好吃的'].map(
                  (q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                        inputRef.current?.focus();
                      }}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-sm hover:bg-blue-100 transition-colors"
                    >
                      {q}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                )}
              >
                {msg.role === 'assistant' && msg.content === '' && msg.isStreaming && (
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                )}

                {msg.content && (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.content}
                  </div>
                )}

                {msg.role === 'assistant' &&
                  msg.extractedTags &&
                  msg.extractedTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className="text-xs text-gray-400">识别标签：</span>
                      {msg.extractedTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                {/* Sources section - only for fact/mixed with sources */}
                {msg.role === 'assistant' &&
                  msg.sources &&
                  msg.sources.length > 0 &&
                  msg.category !== 'emotion' && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">
                          依据来源 ({msg.sources.length}条)
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setSortBy('overall_match')}
                            className={cn(
                              'text-xs px-2 py-0.5 rounded',
                              sortBy === 'overall_match'
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-400 hover:text-gray-600'
                            )}
                          >
                            综合排序
                          </button>
                          <button
                            onClick={() => setSortBy('tag_match')}
                            className={cn(
                              'text-xs px-2 py-0.5 rounded',
                              sortBy === 'tag_match'
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-400 hover:text-gray-600'
                            )}
                          >
                            Tag排序
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleSourceExpand(msg.id)}
                        className="text-xs text-blue-500 hover:text-blue-700 mb-2"
                      >
                        {expandedSources.has(msg.id) ? '收起来源详情 ▲' : '展开来源详情 ▼'}
                      </button>

                      {expandedSources.has(msg.id) && (
                        <div className="space-y-2">
                          {sortedSources(msg.sources).map((source) => (
                            <div
                              key={source.id}
                              className="bg-gray-50 rounded-lg p-3 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-medium text-gray-700">
                                  {source.title}
                                </div>
                                {isExpired(source.updated_at) && (
                                  <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                                    可能过期
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1.5 text-gray-500">
                                <span>
                                  来源：{SOURCE_LEVEL_LABELS[source.source_level] || source.source_level}
                                </span>
                                <span>
                                  tag匹配度：{source.tag_match}%
                                </span>
                                <span>
                                  综合匹配度：{source.overall_match}%
                                </span>
                              </div>
                              {source.tags.length > 0 && (
                                <div className="flex gap-1 mt-1.5">
                                  {source.tags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px]"
                                    >
                                      {tag.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="text-gray-400 mt-1">
                                更新于 {new Date(source.updated_at).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="问我关于校区生活的任何问题..."
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className={cn(
              'px-5 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isLoading || !input.trim()
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
