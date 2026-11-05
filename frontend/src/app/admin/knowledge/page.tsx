'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownAZ,
  BookOpen,
  CalendarDays,
  Clock3,
  Database,
  FilePenLine,
  Filter,
  Plus,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import type { KnowledgeItem, Tag } from '@cczu/shared';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { PermanentDeleteDialog } from '@/components/permanent-delete-dialog';
import { TagMultiSelect } from '@/components/tag-multi-select';
import { AiAutoToggle } from '@/components/ai-auto-toggle';
import { SearchFilterBar } from '@/components/search-filter-bar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SOURCE_LEVELS: Array<{
  value: 'official' | 'admin_reviewed' | 'user_share';
  label: string;
}> = [
  { value: 'official', label: '官方' },
  { value: 'admin_reviewed', label: '管理员审核' },
  { value: 'user_share', label: '用户分享' },
];

const SOURCE_LEVEL_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_LEVELS.map((item) => [item.value, item.label])
);

const REVIEW_STATUS_LABELS: Record<string, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已驳回',
};

type KnowledgePeriod = 'today' | 'week' | 'month' | 'year' | 'all';

const PERIOD_OPTIONS: Array<{
  value: KnowledgePeriod;
  label: string;
}> = [
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
  { value: 'all', label: '所有' },
];

interface SourceType {
  id: string;
  value: string;
  label: string;
  description: string | null;
  status: string;
  created_at: string;
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

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchTitle, setMatchTitle] = useState(true);
  const [matchContent, setMatchContent] = useState(true);
  const [period, setPeriod] = useState<KnowledgePeriod>('all');
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [tagFilterMode, setTagFilterMode] = useState<'or' | 'and'>('or');
  const [sourceLevel, setSourceLevel] = useState<
    'all' | 'official' | 'admin_reviewed' | 'user_share'
  >('all');
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [viewing, setViewing] = useState<KnowledgeItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formSourceType, setFormSourceType] = useState('');
  const [formSourceLevel, setFormSourceLevel] = useState('user_share');
  const [formReviewStatus, setFormReviewStatus] = useState('approved');
  const [formTagIds, setFormTagIds] = useState<string[]>([]);
  const [formTypeSortMode, setFormTypeSortMode] = useState<
    'created' | 'name'
  >('created');
  const [aiAutoType, setAiAutoType] = useState(false);
  const [aiTypeStatus, setAiTypeStatus] = useState('');
  const [aiTypeLoading, setAiTypeLoading] = useState(false);
  const [aiSelectedTypeValue, setAiSelectedTypeValue] = useState<
    string | null
  >(null);
  const [aiAutoAdd, setAiAutoAdd] = useState(false);
  const [aiTagStatus, setAiTagStatus] = useState('');
  const [aiTagLoading, setAiTagLoading] = useState(false);
  const [aiSelectedTagIds, setAiSelectedTagIds] = useState<string[]>([]);
  const aiSelectedTagIdsRef = useRef<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchItems = async () => {
    setLoading(true);
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
      params.set('period', period);
      if (filterTagIds.length > 0) {
        params.set('tag_ids', filterTagIds.join(','));
        params.set('tag_mode', tagFilterMode);
      }
      if (sourceLevel !== 'all') {
        params.set('source_level', sourceLevel);
      }
      const response = await apiFetch(`/api/knowledge?${params}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '获取知识库失败');
      }
      setItems(data.data || []);
    } catch (requestError) {
      setNotice({
        kind: 'error',
        text:
          requestError instanceof Error
            ? requestError.message
            : '获取知识库失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await apiFetch('/api/tags');
      const data = await response.json();
      const nextTags: Tag[] = data.data || [];
      setAllTags(nextTags);
      setTags(nextTags.filter((tag) => tag.status === 'active'));
    } catch {
      // Tag management still works independently.
    }
  };

  const fetchSourceTypes = async () => {
    try {
      const response = await apiFetch('/api/source-types');
      const data = await response.json();
      setSourceTypes(data.data || []);
    } catch {
      // Type management still works independently.
    }
  };

  useEffect(() => {
    void fetchTags();
    void fetchSourceTypes();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchItems();
    }, searchQuery ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [
    searchQuery,
    matchTitle,
    matchContent,
    period,
    filterTagIds,
    tagFilterMode,
    sourceLevel,
  ]);

  useEffect(() => {
    if (!showForm || !aiAutoType) {
      setAiTypeLoading(false);
      return;
    }
    const title = formTitle.trim();
    if (!title) {
      setAiTypeLoading(false);
      setAiSelectedTypeValue(null);
      setAiTypeStatus('输入标题后开始 AI 推荐');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAiTypeLoading(true);
      setAiTypeStatus('AI 正在分析需求并核对类型描述...');
      try {
        const response = await apiFetch('/api/source-types/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content: formContent,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'AI 类型推荐失败');
        }
        const suggested: SourceType | null = data.data;
        const summary =
          typeof data.summary === 'string' ? data.summary.trim() : '';
        if (suggested) {
          setFormSourceType(suggested.value);
          setAiSelectedTypeValue(suggested.value);
          setAiTypeStatus(
            `${summary ? `AI 理解：${summary}；` : ''}已选择类型：${suggested.label}`
          );
        } else {
          setAiSelectedTypeValue(null);
          setAiTypeStatus(
            `${summary ? `AI 理解：${summary}；` : ''}未找到合适的已有类型`
          );
        }
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return;
        }
        setAiTypeStatus(
          requestError instanceof Error
            ? requestError.message
            : 'AI 类型推荐失败'
        );
      } finally {
        if (!controller.signal.aborted) setAiTypeLoading(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setAiTypeLoading(false);
    };
  }, [aiAutoType, formContent, formTitle, showForm]);

  useEffect(() => {
    if (!showForm || !aiAutoAdd) {
      setAiTagLoading(false);
      return;
    }
    const title = formTitle.trim();
    if (!title) {
      setAiTagLoading(false);
      const previousAutoIds = aiSelectedTagIdsRef.current;
      if (previousAutoIds.length > 0) {
        setFormTagIds((previous) =>
          previous.filter((id) => !previousAutoIds.includes(id))
        );
        aiSelectedTagIdsRef.current = [];
        setAiSelectedTagIds([]);
      }
      setAiTagStatus('输入标题后开始 AI 推荐');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAiTagLoading(true);
      setAiTagStatus('AI 正在分析需求并核对 Tag 描述...');
      try {
        const response = await apiFetch('/api/tags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content: formContent,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'AI 标签推荐失败');
        }
        const suggested: Tag[] = data.data || [];
        const summary =
          typeof data.summary === 'string' ? data.summary.trim() : '';
        const previousAutoIds = aiSelectedTagIdsRef.current;
        const nextAutoIds = suggested.map((tag) => tag.id);
        if (suggested.length > 0) {
          setFormTagIds((previous) => [
            ...new Set([
              ...previous.filter(
                (id) => !previousAutoIds.includes(id)
              ),
              ...nextAutoIds,
            ]),
          ]);
          aiSelectedTagIdsRef.current = nextAutoIds;
          setAiSelectedTagIds(nextAutoIds);
          setAiTagStatus(
            `${summary ? `AI 理解：${summary}；` : ''}已选择：${suggested
              .map((tag) => tag.name)
              .join('、')}`
          );
        } else {
          setFormTagIds((previous) =>
            previous.filter((id) => !previousAutoIds.includes(id))
          );
          aiSelectedTagIdsRef.current = [];
          setAiSelectedTagIds([]);
          setAiTagStatus(
            `${summary ? `AI 理解：${summary}；` : ''}未找到合适的已有标签`
          );
        }
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return;
        }
        setAiTagStatus(
          requestError instanceof Error
            ? requestError.message
            : 'AI 标签推荐失败'
        );
      } finally {
        if (!controller.signal.aborted) setAiTagLoading(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setAiTagLoading(false);
    };
  }, [aiAutoAdd, formContent, formTitle, showForm]);

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormSourceType('');
    setFormSourceLevel('user_share');
    setFormReviewStatus('approved');
    setFormTagIds([]);
    setAiAutoType(false);
    setAiTypeStatus('');
    setAiSelectedTypeValue(null);
    setAiAutoAdd(false);
    setAiTagStatus('');
    setAiSelectedTagIds([]);
    aiSelectedTagIdsRef.current = [];
    setEditing(null);
    setShowForm(false);
    setFormError('');
  };

  const handleEdit = (item: KnowledgeItem) => {
    setEditing(item);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormSourceType(item.source_type || '');
    setFormSourceLevel(item.source_level);
    setFormReviewStatus(item.review_status);
    setFormTagIds(
      item.knowledge_item_tags?.map((tag) => tag.tag_id) || []
    );
    setAiAutoType(false);
    setAiTypeStatus('');
    setAiSelectedTypeValue(null);
    setAiAutoAdd(false);
    setAiTagStatus('');
    setAiSelectedTagIds([]);
    aiSelectedTagIdsRef.current = [];
    setFormError('');
    setShowForm(true);
  };

  const openKnowledgeDetail = (item: KnowledgeItem) => {
    setViewing(item);
    setDetailOpen(true);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError('标题和正文不能为空');
      return;
    }
    if (!formSourceType) {
      setFormError('请选择知识条目类型');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const response = await apiFetch(
        editing ? `/api/knowledge/${editing.id}` : '/api/knowledge',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            content: formContent,
            source_type: formSourceType,
            source_level: formSourceLevel,
            review_status: formReviewStatus,
            tag_ids: formTagIds,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '保存知识条目失败');
      }
      setNotice({
        kind: 'success',
        text: editing ? '知识条目已更新' : '知识条目已创建',
      });
      resetForm();
      await fetchItems();
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : '保存知识条目失败'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const response = await apiFetch(`/api/knowledge/${deleting.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '删除知识条目失败');
      }
      setNotice({ kind: 'success', text: '知识条目已永久删除' });
      setDeleting(null);
      if (viewing?.id === deleting.id) setDetailOpen(false);
      await fetchItems();
    } catch (requestError) {
      setDeleteError(
        requestError instanceof Error
          ? requestError.message
          : '删除知识条目失败'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const pendingCount = items.filter(
    (item) => item.review_status === 'pending'
  ).length;
  const typeLabelMap = new Map(
    sourceTypes.map((sourceType) => [
      sourceType.value,
      sourceType.label,
    ])
  );
  const availableFormTypes = sourceTypes.filter(
    (sourceType) =>
      sourceType.status === 'active' ||
      sourceType.value === formSourceType
  );
  const sortedFormTypes =
    formTypeSortMode === 'name'
      ? [...availableFormTypes].sort((left, right) =>
          left.label.localeCompare(right.label, 'zh-CN', {
            numeric: true,
            sensitivity: 'base',
          })
        )
      : [...availableFormTypes].sort(
          (left, right) =>
            Date.parse(left.created_at) - Date.parse(right.created_at)
        );
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    period !== 'all' ||
    filterTagIds.length > 0 ||
    sourceLevel !== 'all';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <BookOpen className="h-6 w-6 text-blue-600" />
            知识库管理
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            管理员可查看全部状态，并维护知识条目与待审核内容。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新建条目
        </button>
      </div>

      {notice && (
        <div
          className={cn(
            'mb-4 rounded-lg border px-4 py-3 text-sm',
            notice.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          )}
        >
          {notice.text}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs text-slate-400">知识条目</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {items.length}
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs text-amber-700">待审核</div>
          <div className="mt-1 text-2xl font-semibold text-amber-800">
            {pendingCount}
          </div>
        </div>
      </div>

      <div className="mb-5">
        <SearchFilterBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索知识条目标题或正文"
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

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
              <CalendarDays className="h-4 w-4" />
              更新时间
            </div>
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriod(option.value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition',
                    period === option.value
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
              <Filter className="h-4 w-4" />
              来源筛选
            </div>
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
              {[
                { value: 'all' as const, label: '全部来源' },
                ...SOURCE_LEVELS,
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSourceLevel(option.value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition',
                    sourceLevel === option.value
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <TagIcon className="h-4 w-4" />
              Tag 筛选
              {filterTagIds.length > 0 && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                  已选 {filterTagIds.length}
                </span>
              )}
            </div>
            <div className="inline-flex rounded-md bg-slate-100 p-0.5">
              {(['or', 'and'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTagFilterMode(mode)}
                  className={cn(
                    'rounded px-2.5 py-1 text-[11px] font-semibold transition',
                    tagFilterMode === mode
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <TagMultiSelect
            tags={allTags}
            selectedIds={filterTagIds}
            onChange={setFilterTagIds}
            placeholder={
              allTags.length === 0
                ? '暂无可用标签'
                : '选择要筛选的 Tag'
            }
            disabled={allTags.length === 0}
          />
          <p className="mt-2 text-[11px] text-slate-400">
            {tagFilterMode === 'or'
              ? 'OR：匹配任一选中 Tag 即显示'
              : 'AND：必须包含全部选中 Tag'}
          </p>
        </div>
      </div>

      {showForm && (
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? '编辑知识条目' : '新建知识条目'}
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                标题
              </label>
              <input
                value={formTitle}
                onChange={(event) => setFormTitle(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                正文
              </label>
              <textarea
                value={formContent}
                onChange={(event) => setFormContent(event.target.value)}
                className="h-40 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">
                  类型
                </span>
                <AiAutoToggle
                  checked={aiAutoType}
                  loading={aiTypeLoading}
                  onChange={(checked) => {
                    setAiAutoType(checked);
                    if (!checked) {
                      setAiTypeStatus('');
                      setAiSelectedTypeValue(null);
                    }
                  }}
                />
              </div>
              {aiTypeStatus && (
                <p
                  className={cn(
                    'mb-2 text-xs leading-5',
                    aiTypeLoading ? 'text-blue-600' : 'text-slate-500'
                  )}
                >
                  {aiTypeStatus}
                </p>
              )}
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormTypeSortMode('created')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
                    formTypeSortMode === 'created'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  <Clock3 className="h-3.5 w-3.5" />
                  按创建时间排序
                </button>
                <button
                  type="button"
                  onClick={() => setFormTypeSortMode('name')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
                    formTypeSortMode === 'name'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                  按名称排序
                </button>
              </div>
              <select
                value={formSourceType}
                onChange={(event) => {
                  setFormSourceType(event.target.value);
                  setAiSelectedTypeValue(null);
                  setAiTypeStatus('');
                }}
                className={cn(
                  'w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
                  aiSelectedTypeValue === formSourceType &&
                    formSourceType
                    ? 'border-amber-300 bg-blue-50 ring-2 ring-amber-100'
                    : 'border-slate-300 bg-white'
                )}
              >
                <option value="" disabled>
                  暂未选择
                </option>
                {sortedFormTypes.map((sourceType) => (
                  <option key={sourceType.value} value={sourceType.value}>
                    {sourceType.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  来源等级
                </label>
                <select
                  value={formSourceLevel}
                  onChange={(event) =>
                    setFormSourceLevel(event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                >
                  {SOURCE_LEVELS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  审核状态
                </label>
                <select
                  value={formReviewStatus}
                  onChange={(event) =>
                    setFormReviewStatus(event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                >
                  {Object.entries(REVIEW_STATUS_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">
                  Tag
                </span>
                <AiAutoToggle
                  checked={aiAutoAdd}
                  loading={aiTagLoading}
                  onChange={(checked) => {
                    setAiAutoAdd(checked);
                    if (!checked) {
                      setFormTagIds([]);
                      setAiTagStatus('');
                      setAiSelectedTagIds([]);
                      aiSelectedTagIdsRef.current = [];
                    }
                  }}
                />
              </div>
              {aiTagStatus && (
                <p
                  className={cn(
                    'mb-2 text-xs leading-5',
                    aiTagLoading ? 'text-blue-600' : 'text-slate-500'
                  )}
                >
                  {aiTagStatus}
                </p>
              )}
              <TagMultiSelect
                tags={tags}
                selectedIds={formTagIds}
                aiSelectedIds={aiSelectedTagIds}
                onChange={(nextIds) => {
                  setFormTagIds(nextIds);
                  const nextAutoIds = aiSelectedTagIdsRef.current.filter(
                    (id) => nextIds.includes(id)
                  );
                  if (
                    nextAutoIds.length !==
                    aiSelectedTagIdsRef.current.length
                  ) {
                    aiSelectedTagIdsRef.current = nextAutoIds;
                    setAiSelectedTagIds(nextAutoIds);
                  }
                }}
                placeholder="选择知识条目 Tag"
              />
            </div>
            {formError && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
                {formError}
              </p>
            )}
            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {submitting
                  ? '保存中...'
                  : editing
                    ? '保存修改'
                    : '创建'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">
            正在加载知识库...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
            {hasActiveFilters
              ? '没有匹配的知识条目'
              : '知识库暂无条目，可从信息源转存或手动新建。'}
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              role="button"
              tabIndex={0}
              aria-label={`查看知识条目：${item.title}`}
              onClick={() => openKnowledgeDetail(item)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openKnowledgeDetail(item);
                }
              }}
              className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transform-none sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isExpired(item.updated_at) && (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-600">
                        可能过期
                      </span>
                    )}
                    {item.source_type && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        {typeLabelMap.get(item.source_type) ||
                          item.source_type}
                      </span>
                    )}
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                      {SOURCE_LEVEL_LABELS[item.source_level] ||
                        item.source_level}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {REVIEW_STATUS_LABELS[item.review_status] ||
                        item.review_status}
                    </span>
                    {item.source_id && (
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                        <Database className="h-3 w-3" />
                        来自信息源
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-slate-900 transition-colors group-hover:text-blue-700">
                    {item.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {item.content}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>更新于 {formatDate(item.updated_at)}</span>
                    {item.knowledge_item_tags?.length > 0 && (
                      <span>
                        {item.knowledge_item_tags
                          .map((tag) => tag.tags?.name)
                          .filter(Boolean)
                          .join('、')}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="flex shrink-0 flex-wrap justify-end gap-1.5"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                  >
                    <FilePenLine className="h-3.5 w-3.5" />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(item);
                      setDeleteError('');
                    }}
                    className="inline-flex items-center gap-1 rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))
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
              setViewing(null);
            }
          }}
        >
          {viewing && (
            <>
              <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-14">
                <div className="flex flex-wrap gap-2">
                  {viewing.source_type && (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      {typeLabelMap.get(viewing.source_type) ||
                        viewing.source_type}
                    </span>
                  )}
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {SOURCE_LEVEL_LABELS[viewing.source_level] ||
                      viewing.source_level}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {REVIEW_STATUS_LABELS[viewing.review_status] ||
                      viewing.review_status}
                  </span>
                </div>
                <DialogTitle className="mt-2 text-xl leading-7 text-slate-900">
                  {viewing.title}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  创建于 {formatDate(viewing.created_at)} · 更新于{' '}
                  {formatDate(viewing.updated_at)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 px-6 py-5">
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {viewing.content}
                </div>
                {viewing.knowledge_item_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {viewing.knowledge_item_tags.map((tag) => (
                      <span
                        key={tag.tag_id}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                      >
                        {tag.tags?.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setDetailOpen(false);
                      handleEdit(viewing);
                    }}
                    className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(viewing);
                      setDetailOpen(false);
                      setDeleteError('');
                    }}
                    className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    永久删除
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PermanentDeleteDialog
        open={Boolean(deleting)}
        itemName={deleting?.title || ''}
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleting(null);
            setDeleteError('');
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
