'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  LockKeyhole,
  MessageCircle,
  Send,
  UserRound,
} from 'lucide-react';
import type { DirectMessage, Role, SourceComment } from '@cczu/shared';
import { cn } from '@/lib/utils';
import { useApp } from '@/components/app-provider';
import { apiFetch } from '@/lib/api';

interface ConversationSummary {
  peer_id: string;
  display_name: string;
  peer_role?: Role;
  last_message: string;
  last_at: string;
}

interface SourceDiscussionProps {
  sourceId: string;
  sourceOwnerId: string;
  sourceOwnerName: string;
  sourceStatus: string;
  allowDiscussion: boolean;
  initialMode?: 'public' | 'private';
  initialPeerId?: string;
  initialPeerName?: string;
  initialPeerRole?: Role;
}

export function SourceDiscussion({
  sourceId,
  sourceOwnerId,
  sourceOwnerName,
  sourceStatus,
  allowDiscussion,
  initialMode,
  initialPeerId,
  initialPeerName,
  initialPeerRole,
}: SourceDiscussionProps) {
  const { user } = useApp();
  const [mode, setMode] = useState<'public' | 'private'>(
    initialMode || (allowDiscussion ? 'public' : 'private')
  );
  const [comments, setComments] = useState<SourceComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    []
  );
  const [peer, setPeer] = useState<{
    id: string;
    name: string;
    role?: Role;
  } | null>(
    initialPeerId && initialPeerName
      ? {
          id: initialPeerId,
          name: initialPeerName,
          role: initialPeerRole,
        }
      : user && user.id !== sourceOwnerId
        ? { id: sourceOwnerId, name: sourceOwnerName }
        : null
  );
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [privateLoading, setPrivateLoading] = useState(false);
  const [error, setError] = useState('');

  const isOwner = user?.id === sourceOwnerId;

  const fetchComments = useCallback(async () => {
    if (!allowDiscussion || sourceStatus !== 'approved') return;
    setCommentsLoading(true);
    try {
      const response = await apiFetch(`/api/sources/${sourceId}/comments`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '获取讨论失败');
      }
      setComments(data.data || []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '获取讨论失败'
      );
    } finally {
      setCommentsLoading(false);
    }
  }, [allowDiscussion, sourceId, sourceStatus]);

  const fetchConversations = useCallback(async () => {
    if (!isOwner) return;
    try {
      const response = await apiFetch(
        `/api/messages/conversations?source_id=${sourceId}`
      );
      const data = await response.json();
      if (response.ok) setConversations(data.data || []);
    } catch {
      // Private conversations remain optional.
    }
  }, [isOwner, sourceId]);

  const fetchThread = useCallback(async () => {
    if (!peer || sourceStatus !== 'approved') return;
    setPrivateLoading(true);
    try {
      const response = await apiFetch(
        `/api/messages/thread?source_id=${sourceId}&peer_id=${peer.id}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '获取私聊失败');
      }
      setMessages(data.data || []);
      if (data.peer?.role === 'admin' || data.peer?.role === 'user') {
        setPeer((previous) => {
          if (
            !previous ||
            previous.role === (data.peer.role as Role)
          ) {
            return previous;
          }
          return { ...previous, role: data.peer.role as Role };
        });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '获取私聊失败'
      );
    } finally {
      setPrivateLoading(false);
    }
  }, [peer, sourceId, sourceStatus]);

  useEffect(() => {
    setMode(initialMode || (allowDiscussion ? 'public' : 'private'));
    setPeer(
      initialPeerId && initialPeerName
        ? {
            id: initialPeerId,
            name: initialPeerName,
            role: initialPeerRole,
          }
        : user && user.id !== sourceOwnerId
          ? { id: sourceOwnerId, name: sourceOwnerName }
          : null
    );
    setComments([]);
    setMessages([]);
    setError('');
    void fetchComments();
    void fetchConversations();
  }, [
    allowDiscussion,
    fetchComments,
    fetchConversations,
    initialMode,
    initialPeerId,
    initialPeerName,
    initialPeerRole,
    sourceId,
    sourceOwnerId,
    sourceOwnerName,
    user,
  ]);

  useEffect(() => {
    if (user && user.id !== sourceOwnerId) {
      setPeer({ id: sourceOwnerId, name: sourceOwnerName });
    }
  }, [sourceOwnerId, sourceOwnerName, user]);

  useEffect(() => {
    if (mode !== 'private' || !peer) return;
    void fetchThread();
    const timer = window.setInterval(() => {
      void fetchThread();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchThread, mode, peer]);

  const submitComment = async () => {
    const content = commentInput.trim();
    if (!content || !allowDiscussion) return;
    setError('');
    try {
      const response = await apiFetch(
        `/api/sources/${sourceId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '发布讨论失败');
      }
      setComments((previous) => [...previous, data.data]);
      setCommentInput('');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '发布讨论失败'
      );
    }
  };

  const submitMessage = async () => {
    const content = messageInput.trim();
    if (!content || !peer) return;
    setError('');
    try {
      const response = await apiFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: sourceId,
          recipient_id: peer.id,
          content,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '发送私聊失败');
      }
      setMessages((previous) => [...previous, data.data]);
      setMessageInput('');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '发送私聊失败'
      );
    }
  };

  if (!user) return null;

  return (
    <section className="border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          讨论与私聊
        </h3>
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode('public')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition',
              mode === 'public'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500'
            )}
          >
            公开讨论
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('private');
              void fetchConversations();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
              mode === 'private'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500'
            )}
          >
            <LockKeyhole className="h-3.5 w-3.5" />
            私聊
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {mode === 'public' ? (
        <div className="mt-4">
          {!allowDiscussion ? (
            <div className="rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
              作者未开放公开讨论，可使用私聊沟通。
            </div>
          ) : sourceStatus !== 'approved' ? (
            <div className="rounded-lg bg-amber-50 px-4 py-5 text-center text-sm text-amber-700">
              信息源审核通过后可参与公开讨论。
            </div>
          ) : (
            <>
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {commentsLoading ? (
                  <p className="py-5 text-center text-xs text-slate-400">
                    正在加载讨论...
                  </p>
                ) : comments.length === 0 ? (
                  <p className="py-5 text-center text-xs text-slate-400">
                    暂无讨论，来留下第一条回复吧。
                  </p>
                ) : (
                  comments.map((comment) => (
                    <article
                      key={comment.id}
                      className="rounded-lg bg-slate-50 px-3.5 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <UserRound className="h-3.5 w-3.5 text-slate-400" />
                          {comment.author_name}
                          {comment.author_role === 'admin' && (
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              管理员
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          {new Date(comment.created_at).toLocaleString('zh-CN')}
                          {comment.author_id !== user.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setPeer({
                                  id: comment.author_id,
                                  name: comment.author_name,
                                  role: comment.author_role,
                                });
                                setMode('private');
                              }}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              私聊
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {comment.content}
                      </p>
                    </article>
                  ))
                )}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={commentInput}
                  onChange={(event) => setCommentInput(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="公开回复这条信息源..."
                  className="min-h-11 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={() => void submitComment()}
                  disabled={!commentInput.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                  aria-label="发布公开回复"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {isOwner && !peer && conversations.length > 0 && (
            <div className="mb-3 space-y-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.peer_id}
                  type="button"
                  onClick={() =>
                    setPeer({
                      id: conversation.peer_id,
                      name: conversation.display_name,
                    })
                  }
                  className="w-full rounded-lg bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100"
                >
                  <div className="text-sm font-medium text-slate-700">
                    {conversation.display_name}
                    {conversation.peer_role === 'admin' && (
                      <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        管理员
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    {conversation.last_message}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!peer ? (
            <div className="rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
              {isOwner
                ? '从公开讨论中选择一位用户，或等待其他用户私聊你。'
                : '信息源作者不可用。'}
            </div>
          ) : sourceStatus !== 'approved' ? (
            <div className="rounded-lg bg-amber-50 px-4 py-5 text-center text-sm text-amber-700">
              信息源审核通过后可发起私聊。
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <span className="inline-flex items-center gap-2">
                  与 {peer.name} 的私聊
                  {peer.role === 'admin' && (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      管理员
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  <LockKeyhole className="h-3 w-3" />
                  仅双方可见
                </span>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setPeer(null);
                    void fetchConversations();
                  }}
                  className="mb-2 text-xs text-slate-400 hover:text-slate-700"
                >
                  返回私聊会话列表
                </button>
              )}
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
                {privateLoading && messages.length === 0 ? (
                  <p className="py-5 text-center text-xs text-slate-400">
                    正在加载私聊...
                  </p>
                ) : messages.length === 0 ? (
                  <p className="py-5 text-center text-xs text-slate-400">
                    暂无消息，可以直接沟通活动安排。
                  </p>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_id === user.id;
                    const senderName = mine
                      ? message.sender_name || user.display_name
                      : message.sender_id === peer?.id
                        ? message.sender_name || peer.name
                        : '私聊用户';
                    const senderRole =
                      message.sender_role ||
                      (mine ? user.role : peer?.role);
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          'flex flex-col',
                          mine ? 'items-end' : 'items-start'
                        )}
                      >
                        <div
                          data-private-sender={message.sender_id}
                          className={cn(
                            'mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium',
                            mine ? 'text-blue-700' : 'text-slate-500'
                          )}
                        >
                          <UserRound className="h-3 w-3" />
                          {senderName}
                          {senderRole === 'admin' && (
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              管理员
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-5',
                            mine
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-700 shadow-sm'
                          )}
                        >
                          {message.content}
                          <div
                            className={cn(
                              'mt-1 text-[10px]',
                              mine ? 'text-blue-100' : 'text-slate-400'
                            )}
                          >
                            {new Date(message.created_at).toLocaleTimeString(
                              'zh-CN',
                              { hour: '2-digit', minute: '2-digit' }
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="发送仅双方可见的消息..."
                  className="min-h-11 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => void submitMessage()}
                  disabled={!messageInput.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
                  aria-label="发送私聊"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
