'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Inbox,
  MapPin,
  Shapes,
  ShieldCheck,
  Tag as TagIcon,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface SourceItem {
  id: string;
  title: string;
  content: string;
  type: string;
  contact_mode: string;
  location: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
  source_tags: Array<{
    tag_id: string;
    tags: { id: string; name: string };
  }> | null;
}

interface CatalogRequest {
  id: string;
  request_type: 'tag' | 'source_type';
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  created_at: string;
  requested_by_profile: { display_name: string } | null;
}

type ReviewTab = 'sources' | 'tags' | 'types';
type RejectTarget = {
  kind: 'source' | 'catalog';
  id: string;
  name: string;
};

const SOURCE_TYPES: Record<string, string> = {
  partner: '找搭子',
  second_hand: '二手交易',
  lost_found: '失物招领',
  experience: '校园经验',
};

export default function ReviewPage() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [catalogRequests, setCatalogRequests] = useState<CatalogRequest[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReviewTab>('sources');
  const [selected, setSelected] = useState<SourceItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    setActionError('');
    try {
      const [sourceResponse, catalogResponse] = await Promise.all([
        apiFetch('/api/review'),
        apiFetch('/api/review/catalog-requests'),
      ]);
      const sourceData = await sourceResponse.json();
      const catalogData = await catalogResponse.json();
      if (!sourceResponse.ok) {
        throw new Error(sourceData?.error || '获取待审核信息源失败');
      }
      if (!catalogResponse.ok) {
        throw new Error(catalogData?.error || '获取目录申请失败');
      }
      setSources(sourceData.data || []);
      setCatalogRequests(catalogData.data || []);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : '加载审核内容失败'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPending();
  }, []);

  const approveSource = async (id: string) => {
    setActionLoading(true);
    setActionError('');
    try {
      const response = await apiFetch(`/api/review/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '审核失败');
      }
      setSelected(null);
      await fetchPending();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : '审核失败'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const approveCatalog = async (request: CatalogRequest) => {
    setActionLoading(true);
    setActionError('');
    try {
      const response = await apiFetch(
        `/api/review/catalog-requests/${request.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '审核失败');
      }
      await fetchPending();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : '审核失败'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const submitRejection = async () => {
    if (!rejectTarget || !rejectReason.trim()) {
      setActionError('请填写驳回原因');
      return;
    }
    setActionLoading(true);
    setActionError('');

    try {
      const path =
        rejectTarget.kind === 'source'
          ? `/api/review/${rejectTarget.id}`
          : `/api/review/catalog-requests/${rejectTarget.id}`;
      const body =
        rejectTarget.kind === 'source'
          ? {
              status: 'rejected',
              reject_reason: rejectReason,
            }
          : {
              status: 'rejected',
              review_note: rejectReason,
            };
      const response = await apiFetch(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '驳回失败');
      }
      setRejectTarget(null);
      setRejectReason('');
      setSelected(null);
      await fetchPending();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : '驳回失败'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const tagRequests = catalogRequests.filter(
    (request) => request.request_type === 'tag'
  );
  const typeRequests = catalogRequests.filter(
    (request) => request.request_type === 'source_type'
  );
  const visibleCatalogRequests =
    tab === 'tags' ? tagRequests : typeRequests;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          审核后台
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          分别审核社区信息源、Tag 申请和信息源类型申请
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          {
            value: 'sources' as const,
            label: '信息源',
            count: sources.length,
            icon: ShieldCheck,
          },
          {
            value: 'tags' as const,
            label: 'Tag 申请',
            count: tagRequests.length,
            icon: TagIcon,
          },
          {
            value: 'types' as const,
            label: '类型申请',
            count: typeRequests.length,
            icon: Shapes,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setTab(item.value);
                setSelected(null);
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition',
                tab === item.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px]',
                  tab === item.value
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500'
                )}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {tab === 'sources' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-1">
            {loading ? (
              <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
                加载中...
              </div>
            ) : sources.length === 0 ? (
              <EmptyState text="暂无待审核信息源" />
            ) : (
              sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setSelected(source)}
                  className={cn(
                    'w-full rounded-lg border bg-white p-3 text-left shadow-sm transition',
                    selected?.id === source.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {SOURCE_TYPES[source.type] || source.type}
                  </span>
                  <h3 className="mt-2 truncate text-sm font-medium text-slate-800">
                    {source.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {source.profiles?.display_name} ·{' '}
                    {new Date(source.created_at).toLocaleDateString('zh-CN')}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-2">
            {selected ? (
              <SourceDetail
                source={selected}
                loading={actionLoading}
                onApprove={() => void approveSource(selected.id)}
                onReject={() =>
                  setRejectTarget({
                    kind: 'source',
                    id: selected.id,
                    name: selected.title,
                  })
                }
              />
            ) : (
              <EmptyState text="选择左侧信息源查看详情" />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <EmptyState text="加载中..." />
          ) : visibleCatalogRequests.length === 0 ? (
            <EmptyState
              text={
                tab === 'tags'
                  ? '暂无待审核 Tag 申请'
                  : '暂无待审核类型申请'
              }
            />
          ) : (
            visibleCatalogRequests.map((request) => (
              <CatalogRequestCard
                key={request.id}
                request={request}
                loading={actionLoading}
                onApprove={() => void approveCatalog(request)}
                onReject={() =>
                  setRejectTarget({
                    kind: 'catalog',
                    id: request.id,
                    name: request.name,
                  })
                }
              />
            ))
          )}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <XCircle className="h-5 w-5 text-red-600" />
              驳回「{rejectTarget.name}」
            </h3>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              className="mt-4 h-24 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="请填写驳回原因..."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitRejection()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                <XCircle className="h-4 w-4" />
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center">
      <Inbox className="mx-auto h-7 w-7 text-slate-300" />
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </div>
  );
}

function SourceDetail({
  source,
  loading,
  onApprove,
  onReject,
}: {
  source: SourceItem;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          {SOURCE_TYPES[source.type] || source.type}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
          <Clock className="h-3 w-3" />
          待审核
        </span>
      </div>
      <h2 className="mb-2 mt-2 text-xl font-semibold text-slate-900">
        {source.title}
      </h2>
      <p className="mb-5 whitespace-pre-wrap text-sm leading-7 text-slate-600">
        {source.content}
      </p>
      <div className="mb-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
        <InfoLine
          icon={<User className="h-4 w-4 text-slate-400" />}
          label="发布者"
          value={source.profiles?.display_name || '未知'}
        />
        <InfoLine
          icon={<MapPin className="h-4 w-4 text-slate-400" />}
          label="地点"
          value={source.location || '-'}
        />
        <InfoLine
          icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
          label="联系方式"
          value={
            source.contact_mode === 'platform'
              ? '平台内联系'
              : source.contact_mode === 'masked'
                ? '打码显示'
                : '公开'
          }
        />
        <InfoLine
          icon={<Clock className="h-4 w-4 text-slate-400" />}
          label="发布时间"
          value={new Date(source.created_at).toLocaleString('zh-CN')}
        />
      </div>
      {source.source_tags && source.source_tags.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <TagIcon className="h-4 w-4 text-slate-400" />
          {source.source_tags.map((tag) => (
            <span
              key={tag.tag_id}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
            >
              {tag.tags?.name}
            </span>
          ))}
        </div>
      )}
      <ReviewActions
        loading={loading}
        onApprove={onApprove}
        onReject={onReject}
      />
    </div>
  );
}

function CatalogRequestCard({
  request,
  loading,
  onApprove,
  onReject,
}: {
  request: CatalogRequest;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isTag = request.request_type === 'tag';
  const Icon = isTag ? TagIcon : Shapes;
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              <Icon className="h-3.5 w-3.5" />
              {isTag ? 'Tag 申请' : '类型申请'}
            </span>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              待审核
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">
            {request.name}
          </h3>
          {request.code && (
            <p className="mt-1 font-mono text-xs text-slate-500">
              类型代码：{request.code}
            </p>
          )}
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {request.description || '未填写说明'}
          </p>
          <p className="mt-3 text-xs text-slate-400">
            申请人：{request.requested_by_profile?.display_name || '未知'} ·{' '}
            {new Date(request.created_at).toLocaleString('zh-CN')}
          </p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <ReviewActions
          loading={loading}
          onApprove={onApprove}
          onReject={onReject}
        />
      </div>
    </article>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function ReviewActions({
  loading,
  onApprove,
  onReject,
}: {
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onApprove}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300"
      >
        <CheckCircle2 className="h-4 w-4" />
        通过
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:bg-slate-300"
      >
        <XCircle className="h-4 w-4" />
        驳回
      </button>
    </div>
  );
}
