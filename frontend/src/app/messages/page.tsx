'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import type {
  InteractionNotification,
  SourceItem,
} from '@cczu/shared';
import { useApp } from '@/components/app-provider';
import { SourceDiscussion } from '@/components/source-discussion';
import { SearchFilterBar } from '@/components/search-filter-bar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  draft: { label: '草稿', color: 'bg-slate-100 text-slate-600' },
  pending: { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '已通过', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '已驳回', color: 'bg-red-100 text-red-700' },
};

function notificationLabel(kind: InteractionNotification['kind']) {
  return kind === 'comment' ? '公开讨论' : '私聊消息';
}

export default function MessagesPage() {
  const { user, isLoading: authLoading } = useApp();
  const [notifications, setNotifications] = useState<
    InteractionNotification[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchTitle, setMatchTitle] = useState(true);
  const [matchContent, setMatchContent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedNotification, setSelectedNotification] =
    useState<InteractionNotification | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceItem | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
        params.set(
          'search_fields',
          [matchTitle ? 'title' : '', matchContent ? 'content' : '']
            .filter(Boolean)
            .join(',')
        );
      }
      const response = await apiFetch(`/api/interactions?${params}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '获取消息失败');
      }
      setNotifications(data.data || []);
      setUnreadCount(Number(data?.unread_count || 0));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : '获取消息失败'
      );
    } finally {
      setLoading(false);
    }
  }, [user, searchQuery, matchTitle, matchContent]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const initialTimer = window.setTimeout(() => {
      void fetchNotifications();
    }, searchQuery ? 250 : 0);
    const timer = window.setInterval(() => {
      void fetchNotifications();
    }, 20_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [authLoading, fetchNotifications, searchQuery, user]);

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    setError('');
    try {
      const response = await apiFetch('/api/interactions/read-all', {
        method: 'PATCH',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '标记已读失败');
      }
      const readAt = new Date().toISOString();
      setNotifications((previous) =>
        previous.map((item) => ({
          ...item,
          read_at: item.read_at || readAt,
        }))
      );
      setUnreadCount(0);
      window.dispatchEvent(new Event('cczu-interactions-updated'));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '标记已读失败'
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const openNotification = async (notification: InteractionNotification) => {
    setOpeningId(notification.id);
    setError('');
    setSelectedNotification(notification);

    if (!notification.read_at) {
      try {
        const response = await apiFetch(
          `/api/interactions/${notification.kind}/${notification.id}/read`,
          { method: 'PATCH' }
        );
        const data = await response.json();
        if (response.ok) {
          const readAt = new Date().toISOString();
          setNotifications((previous) =>
            previous.map((item) =>
              item.id === notification.id
                ? { ...item, read_at: readAt }
                : item
            )
          );
          setUnreadCount(Number(data?.unread_count || 0));
          window.dispatchEvent(new Event('cczu-interactions-updated'));
        }
      } catch {
        // Opening the source should not be blocked by a read-state failure.
      }
    }

    try {
      const response = await apiFetch(
        `/api/sources/${notification.source_id}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '获取对应信息源失败');
      }
      setSelectedSource(data.data);
      setDetailOpen(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '获取对应信息源失败'
      );
    } finally {
      setOpeningId(null);
    }
  };

  const filteredNotifications =
    filter === 'unread'
      ? notifications.filter((item) => !item.read_at)
      : notifications;

  if (authLoading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-20 text-sm text-slate-400">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        正在加载消息...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-slate-500">
        登录后可以查看公开讨论和私聊消息。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <Bell className="h-6 w-6 text-blue-600" />
            消息
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            公开讨论和私聊消息会集中显示在这里。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0 || markingAll}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          {markingAll ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
          全部已读
        </button>
      </div>

      <div className="mb-4">
        <SearchFilterBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索信息源标题或消息内容"
          primaryLabel="标题"
          secondaryLabel="内容"
          matchPrimary={matchTitle}
          matchSecondary={matchContent}
          onScopeChange={(scope) => {
            setMatchTitle(scope.matchPrimary);
            setMatchContent(scope.matchSecondary);
          }}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              filter === 'all'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500'
            )}
          >
            全部 {notifications.length}
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              filter === 'unread'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500'
            )}
          >
            未读 {unreadCount}
          </button>
        </div>
        {unreadCount > 0 && (
          <span className="text-xs text-blue-600">
            有 {unreadCount} 条互动等待查看
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">
            正在加载互动消息...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
            {searchQuery
              ? '没有匹配的消息'
              : filter === 'unread'
              ? '没有未读消息'
              : '还没有收到公开讨论或私聊消息'}
          </div>
        ) : (
          filteredNotifications.map((notification) => {
            const unread = !notification.read_at;
            return (
              <article
                key={`${notification.kind}-${notification.id}`}
                role="button"
                tabIndex={0}
                aria-label={`查看消息：${notification.source_title}`}
                onClick={() => void openNotification(notification)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void openNotification(notification);
                  }
                }}
                className={cn(
                  'group cursor-pointer rounded-lg border bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:p-5',
                  unread
                    ? 'border-blue-200 bg-blue-50/30'
                    : 'border-slate-200'
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      notification.kind === 'private_message'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-emerald-100 text-emerald-700'
                    )}
                  >
                    {notification.kind === 'private_message' ? (
                      <LockKeyhole className="h-4 w-4" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-[11px] font-medium',
                          notification.kind === 'private_message'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                        )}
                      >
                        {notificationLabel(notification.kind)}
                      </span>
                      <span className="text-sm font-medium text-slate-800">
                        {notification.actor_name}
                      </span>
                      {notification.actor_role === 'admin' && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          管理员
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {formatDateTime(notification.created_at)}
                      </span>
                      {unread && (
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {notification.content}
                    </p>
                    <div className="mt-3 border-t border-slate-200/70 pt-3">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{notification.source_type_label}</span>
                        <span>·</span>
                        <span>{notification.source_owner_name}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <h2 className="truncate text-sm font-semibold text-slate-800 group-hover:text-blue-700">
                          {notification.source_title}
                        </h2>
                        {openingId === notification.id ? (
                          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {notification.source_excerpt}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) setDetailOpen(false);
        }}
      >
        <DialogContent
          className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-3xl"
          onAnimationEnd={(event) => {
            if (event.animationName === 'cczu-dialog-content-out') {
              setSelectedSource(null);
              setSelectedNotification(null);
            }
          }}
        >
          {selectedSource && selectedNotification && (
            <>
              <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {selectedNotification.source_type_label}
                  </span>
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs',
                      STATUS_LABELS[selectedSource.status]?.color
                    )}
                  >
                    {STATUS_LABELS[selectedSource.status]?.label ||
                      selectedSource.status}
                  </span>
                  {selectedSource.allow_discussion && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      可回复
                    </span>
                  )}
                  {selectedSource.is_expired && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      已过期
                    </span>
                  )}
                </div>
                <DialogTitle className="mt-2 text-xl leading-7 text-slate-900">
                  {selectedSource.title}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span>
                    {selectedSource.profiles?.display_name || '匿名用户'}
                  </span>
                  {selectedNotification.source_owner_role === 'admin' && (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      管理员
                    </span>
                  )}
                  <span>
                    发布于 {formatDateTime(selectedSource.created_at)}
                  </span>
                  {selectedSource.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedSource.location}
                    </span>
                  )}
                  <span>
                    有效期：
                    {selectedSource.valid_until
                      ? formatDateTime(selectedSource.valid_until)
                      : '长期有效'}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 px-6 py-5">
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {selectedSource.content}
                </div>

                {selectedSource.source_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {selectedSource.source_tags.map((item) => (
                      <span
                        key={item.tag_id}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                      >
                        {item.tags?.name}
                      </span>
                    ))}
                  </div>
                )}

                <SourceDiscussion
                  key={`${selectedSource.id}-${selectedNotification.id}`}
                  sourceId={selectedSource.id}
                  sourceOwnerId={selectedSource.created_by}
                  sourceOwnerName={
                    selectedSource.profiles?.display_name || '信息源作者'
                  }
                  sourceStatus={selectedSource.status}
                  allowDiscussion={selectedSource.allow_discussion}
                  initialMode={
                    selectedNotification.kind === 'private_message'
                      ? 'private'
                      : 'public'
                  }
                  initialPeerId={
                    selectedNotification.kind === 'private_message'
                      ? selectedSource.created_by === user.id
                        ? selectedNotification.actor_id
                        : selectedSource.created_by
                      : undefined
                  }
                  initialPeerName={
                    selectedNotification.kind === 'private_message'
                      ? selectedSource.created_by === user.id
                        ? selectedNotification.actor_name
                        : selectedSource.profiles?.display_name ||
                          selectedNotification.source_owner_name
                      : undefined
                  }
                  initialPeerRole={
                    selectedNotification.kind === 'private_message'
                      ? selectedSource.created_by === user.id
                        ? selectedNotification.actor_role
                        : selectedNotification.source_owner_role
                      : undefined
                  }
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
