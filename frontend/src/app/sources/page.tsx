'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownAZ,
  BookOpen,
  CalendarDays,
  Clock3,
  Filter,
  MapPin,
  Newspaper,
  Search,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import type { SourceItem } from '@cczu/shared';
import { cn } from '@/lib/utils';
import { useApp } from '@/components/app-provider';
import { apiFetch } from '@/lib/api';
import { AiAutoToggle } from '@/components/ai-auto-toggle';
import { PermanentDeleteDialog } from '@/components/permanent-delete-dialog';
import { TagMultiSelect } from '@/components/tag-multi-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Tag {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface SourceType {
  id: string;
  value: string;
  label: string;
  description: string | null;
  status: string;
  created_at: string;
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
  { value: 'all', label: '所有' },
];

const STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  draft: { label: '草稿', color: 'bg-slate-100 text-slate-600' },
  pending: { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '已通过', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '已驳回', color: 'bg-red-100 text-red-700' },
};

function formatDate(value: string | null) {
  if (!value) return '未设置';
  return new Date(value).toLocaleDateString('zh-CN');
}

interface SourceEditorProps {
  tags: Tag[];
  sourceTypes: SourceType[];
  editingSource: SourceItem | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

function SourceEditor({
  tags,
  sourceTypes,
  editingSource,
  onSaved,
  onCancel,
}: SourceEditorProps) {
  const [formTitle, setFormTitle] = useState(
    editingSource?.title || ''
  );
  const [formContent, setFormContent] = useState(
    editingSource?.content || ''
  );
  const [formType, setFormType] = useState(editingSource?.type || '');
  const [typeSortMode, setTypeSortMode] =
    useState<'created' | 'name'>('created');
  const [formLocation, setFormLocation] = useState(
    editingSource?.location || ''
  );
  const [formContactMode, setFormContactMode] = useState(
    editingSource?.contact_mode || 'platform'
  );
  const [formContactValue, setFormContactValue] = useState(
    editingSource?.contact_value || ''
  );
  const [formTagIds, setFormTagIds] = useState<string[]>(
    editingSource?.source_tags?.map((item) => item.tag_id) || []
  );
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
  const [error, setError] = useState('');

  const sortedSourceTypes =
    typeSortMode === 'name'
      ? [...sourceTypes].sort((left, right) =>
          left.label.localeCompare(right.label, 'zh-CN', {
            numeric: true,
            sensitivity: 'base',
          })
        )
      : [...sourceTypes].sort(
          (left, right) =>
            Date.parse(left.created_at) - Date.parse(right.created_at)
        );

  useEffect(() => {
    if (!aiAutoAdd) {
      setAiTagLoading(false);
      return;
    }

    const normalizedTitle = formTitle.trim();
    if (!normalizedTitle) {
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
      setAiTagStatus('AI 正在识别相关标签...');

      try {
        const response = await apiFetch('/api/tags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
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
  }, [aiAutoAdd, formTitle, formContent]);

  useEffect(() => {
    if (!aiAutoType) {
      setAiTypeLoading(false);
      return;
    }

    const normalizedTitle = formTitle.trim();
    if (!normalizedTitle) {
      setAiTypeLoading(false);
      setAiSelectedTypeValue(null);
      setFormType('');
      setAiTypeStatus('输入标题后开始 AI 推荐');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAiTypeLoading(true);
      setAiTypeStatus('AI 正在识别信息源类型...');

      try {
        const response = await apiFetch('/api/source-types/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: normalizedTitle,
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
          setFormType(suggested.value);
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
  }, [aiAutoType, formTitle, formContent]);

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formContent.trim() || !formType) {
      setError('请填写标题、正文并选择类型');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const response = await apiFetch(
        editingSource
          ? `/api/sources/${editingSource.id}`
          : '/api/sources',
        {
          method: editingSource ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            content: formContent,
            type: formType,
            location: formLocation || null,
            contact_mode: formContactMode,
            contact_value: formContactValue || null,
            tag_ids: formTagIds,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '保存信息源失败');
      }
      onSaved(
        editingSource ? '修改已保存' : '信息源已保存为草稿'
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '保存信息源失败'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">
          {editingSource ? '修改信息源' : '发布新信息'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          保存后先进入草稿，提交审核并通过后才会展示给全体用户。
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">类型</span>
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
                'mb-2 text-xs',
                aiTypeLoading ? 'text-blue-600' : 'text-slate-500'
              )}
            >
              {aiTypeStatus}
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTypeSortMode('created')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
                typeSortMode === 'created'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'
              )}
            >
              <Clock3 className="h-3.5 w-3.5" />
              按创建时间排序
            </button>
            <button
              type="button"
              onClick={() => setTypeSortMode('name')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
                typeSortMode === 'name'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'
              )}
            >
              <ArrowDownAZ className="h-3.5 w-3.5" />
              按名称排序
            </button>
          </div>
          <select
            value={formType}
            onChange={(event) => {
              setFormType(event.target.value);
              setAiSelectedTypeValue(null);
              setAiTypeStatus('');
            }}
            className={cn(
              'w-full rounded-lg border px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
              aiSelectedTypeValue === formType && formType
                ? 'border-amber-300 bg-blue-50 ring-2 ring-amber-100'
                : 'border-slate-300 bg-white'
            )}
          >
            <option value="" disabled>
              暂未选择
            </option>
            {editingSource &&
              !sourceTypes.some(
                (typeItem) => typeItem.value === editingSource.type
              ) && (
                <option value={editingSource.type}>
                  {editingSource.type}
                </option>
              )}
            {sortedSourceTypes.map((typeItem) => (
              <option key={typeItem.value} value={typeItem.value}>
                {typeItem.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            标题
          </label>
          <input
            value={formTitle}
            onChange={(event) => setFormTitle(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="例如：寻找明晚一起跑步的同学"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            正文
          </label>
          <textarea
            value={formContent}
            onChange={(event) => setFormContent(event.target.value)}
            className="h-36 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="写清时间、地点、需求或物品状态，方便其他同学判断是否匹配。"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            地点范围
          </label>
          <input
            value={formLocation}
            onChange={(event) => setFormLocation(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="例如：西太湖校区南门"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            联系方式展示
          </label>
          <select
            value={formContactMode}
            onChange={(event) => setFormContactMode(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="platform">平台内联系</option>
            <option value="masked">打码显示</option>
            <option value="public">公开显示（需确认）</option>
          </select>
          {formContactMode === 'public' && (
            <input
              value={formContactValue}
              onChange={(event) =>
                setFormContactValue(event.target.value)
              }
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="微信号或手机号"
            />
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">标签</span>
            <AiAutoToggle
              checked={aiAutoAdd}
              loading={aiTagLoading}
              onChange={(checked) => {
                setAiAutoAdd(checked);
                if (!checked) {
                  setAiTagStatus('');
                  setFormTagIds([]);
                  setAiSelectedTagIds([]);
                  aiSelectedTagIdsRef.current = [];
                }
              }}
            />
          </div>
          {aiTagStatus && (
            <p
              className={cn(
                'mb-2 text-xs',
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
            placeholder="选择发布标签"
            onChange={(nextIds) => {
              setFormTagIds(nextIds);
              const nextAutoIds = aiSelectedTagIdsRef.current.filter((id) =>
                nextIds.includes(id)
              );
              if (nextAutoIds.length !== aiSelectedTagIdsRef.current.length) {
                aiSelectedTagIdsRef.current = nextAutoIds;
                setAiSelectedTagIds(nextAutoIds);
              }
            }}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              !formTitle.trim() ||
              !formContent.trim() ||
              !formType
            }
            className={cn(
              'rounded-lg px-4 py-2.5 text-sm font-medium transition',
              submitting ||
                !formTitle.trim() ||
                !formContent.trim() ||
                !formType
                ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {submitting
              ? '保存中...'
              : editingSource
                ? '保存修改'
                : '保存为草稿'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SourcesPage() {
  const { user } = useApp();
  const [tab, setTab] = useState<'all' | 'mine' | 'create'>('all');
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
  const [period, setPeriod] = useState<Period>('all');
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [selectedSource, setSelectedSource] =
    useState<SourceItem | null>(null);
  const [sourceDetailOpen, setSourceDetailOpen] = useState(false);
  const [editingSource, setEditingSource] =
    useState<SourceItem | null>(null);
  const [deletingSource, setDeletingSource] =
    useState<SourceItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    if (tab === 'create') return;
    setLoading(true);
    setListError('');
    try {
      const search = new URLSearchParams();
      if (tab === 'mine') search.set('status', 'mine');
      search.set('period', period);
      if (filterTagIds.length > 0) {
        search.set('tag_ids', filterTagIds.join(','));
      }
      const response = await apiFetch(
        `/api/sources?${search.toString()}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '获取信息源失败');
      }
      setSources(data.data || []);
    } catch (requestError) {
      setSources([]);
      setListError(
        requestError instanceof Error
          ? requestError.message
          : '获取信息源失败'
      );
    } finally {
      setLoading(false);
    }
  }, [tab, period, filterTagIds]);

  useEffect(() => {
    void fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [tagResponse, typeResponse] = await Promise.all([
          apiFetch('/api/tags'),
          apiFetch('/api/source-types'),
        ]);
        const tagData = await tagResponse.json();
        const typeData = await typeResponse.json();
        setTags(
          (tagData.data || []).filter(
            (tag: Tag) => tag.status === 'active'
          )
        );
        setSourceTypes(
          (typeData.data || []).filter(
            (sourceType: SourceType) =>
              sourceType.status === 'active' ||
              sourceType.value === editingSource?.type
          )
        );
      } catch {
        // The list still works when metadata endpoints are unavailable.
      }
    };
    void loadMetadata();
  }, [editingSource?.type]);

  const typeLabel = (value: string) =>
    sourceTypes.find((sourceType) => sourceType.value === value)?.label ||
    value;

  const handleDelete = async () => {
    if (!deletingSource) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const response = await apiFetch(
        `/api/sources/${deletingSource.id}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '删除失败');
      }
      setDeletingSource(null);
      if (selectedSource?.id === deletingSource.id) {
        setSourceDetailOpen(false);
      }
      setNotice({ kind: 'success', text: '信息源已永久删除' });
      await fetchSources();
    } catch (requestError) {
      setDeleteError(
        requestError instanceof Error
          ? requestError.message
          : '删除失败'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const submitForReview = async (source: SourceItem) => {
    try {
      const response = await apiFetch(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '提交审核失败');
      }
      setNotice({ kind: 'success', text: '已提交管理员审核' });
      setSourceDetailOpen(false);
      await fetchSources();
    } catch (requestError) {
      setNotice({
        kind: 'error',
        text:
          requestError instanceof Error
            ? requestError.message
            : '提交审核失败',
      });
    }
  };

  const promoteToKnowledge = async (source: SourceItem) => {
    setPromotingId(source.id);
    try {
      const response = await apiFetch(
        `/api/sources/${source.id}/promote`,
        { method: 'POST' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '转存知识库失败');
      }
      const knowledgeItemId = data.data?.id || 'promoted';
      const update = (item: SourceItem): SourceItem => ({
        ...item,
        knowledge_item_id: knowledgeItemId,
      });
      setSources((previous) =>
        previous.map((item) =>
          item.id === source.id ? update(item) : item
        )
      );
      setSelectedSource((previous) =>
        previous?.id === source.id ? update(previous) : previous
      );
      setNotice({
        kind: 'success',
        text: data.already_promoted
          ? '这条信息源已经在知识库中'
          : '已转存到知识库，用户检索时可用',
      });
    } catch (requestError) {
      setNotice({
        kind: 'error',
        text:
          requestError instanceof Error
            ? requestError.message
            : '转存知识库失败',
      });
    } finally {
      setPromotingId(null);
    }
  };

  const openCreate = () => {
    setEditingSource(null);
    setTab('create');
    setNotice(null);
  };

  const openSourceDetail = (source: SourceItem) => {
    setSelectedSource(source);
    setSourceDetailOpen(true);
  };

  const handleSaved = (message: string) => {
    setNotice({ kind: 'success', text: message });
    setEditingSource(null);
    setTab(user?.role === 'admin' ? 'all' : 'mine');
  };

  const canManageSource = (source: SourceItem) =>
    user?.role === 'admin' ||
    (source.created_by === user?.id &&
      ['draft', 'rejected'].includes(source.status));

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
              <Newspaper className="h-6 w-6 text-blue-600" />
              信息源
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              全校共享的校园信息源广场。筛选、查看并与社区信息匹配。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (tab === 'create') {
                setEditingSource(null);
                setTab('all');
              } else {
                openCreate();
              }
            }}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {tab === 'create' ? '返回列表' : '发布信息'}
          </button>
        </div>

        {notice && (
          <div
            className={cn(
              'mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
              notice.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            )}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="关闭提示"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {tab !== 'create' && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition',
                  tab === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                )}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setTab('mine')}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition',
                  tab === 'mine'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                )}
              >
                我的发布
              </button>
            </div>

            <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="shrink-0">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <CalendarDays className="h-4 w-4" />
                    发布时间
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

                <div className="min-w-0 flex-1 lg:border-l lg:border-slate-200 lg:pl-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <Filter className="h-4 w-4" />
                      Tag 筛选
                      {filterTagIds.length > 0 && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                          已选 {filterTagIds.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <TagMultiSelect
                    tags={tags}
                    selectedIds={filterTagIds}
                    onChange={setFilterTagIds}
                    placeholder={
                      tags.length === 0
                        ? '暂无可用标签'
                        : '选择要筛选的 Tag'
                    }
                    disabled={tags.length === 0}
                  />
                </div>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
              <span>{loading ? '正在加载...' : `共 ${sources.length} 条`}</span>
              <span>支持多个 Tag 同时筛选，匹配任一即可显示</span>
            </div>
          </>
        )}

        {tab === 'create' ? (
          <SourceEditor
            key={editingSource?.id || 'new-source'}
            tags={tags}
            sourceTypes={sourceTypes}
            editingSource={editingSource}
            onSaved={handleSaved}
            onCancel={() => {
              setEditingSource(null);
              setTab('all');
            }}
          />
        ) : (
          <div className="space-y-3">
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">
                正在加载信息源...
              </div>
            ) : listError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-600">
                {listError}
              </div>
            ) : sources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-14 text-center">
                <Search className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">
                  当前筛选条件下暂无信息源
                </p>
              </div>
            ) : (
              sources.map((source) => (
                <article
                  key={source.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看信息源：${source.title}`}
                  onClick={() => openSourceDetail(source)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openSourceDetail(source);
                    }
                  }}
                  className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transform-none sm:p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          {typeLabel(source.type)}
                        </span>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[11px]',
                            STATUS_LABELS[source.status]?.color
                          )}
                        >
                          {STATUS_LABELS[source.status]?.label ||
                            source.status}
                        </span>
                        {source.knowledge_item_id && (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                            <BookOpen className="h-3 w-3" />
                            已收录知识库
                          </span>
                        )}
                      </div>

                      <h3 className="mt-2 text-base font-semibold text-slate-900 transition-colors group-hover:text-blue-700">
                        {source.title}
                      </h3>
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {source.content}
                      </p>
                    </div>

                    {canManageSource(source) && (
                      <div
                        className="flex shrink-0 flex-wrap justify-end gap-1.5"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSource(source);
                            setTab('create');
                          }}
                          className="rounded bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                        >
                          修改
                        </button>
                        {source.status === 'draft' &&
                          source.created_by === user?.id && (
                            <button
                              type="button"
                              onClick={() => void submitForReview(source)}
                              className="rounded bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100"
                            >
                              提交审核
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingSource(source);
                            setDeleteError('');
                          }}
                          className="rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-100"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>

                  {source.reject_reason && (
                    <div className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
                      驳回原因：{source.reject_reason}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                    <span>{source.profiles?.display_name || '匿名用户'}</span>
                    <span>{formatDate(source.created_at)}</span>
                    {source.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {source.location}
                      </span>
                    )}
                    {source.source_tags?.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <TagIcon className="h-3 w-3" />
                        {source.source_tags
                          .map((item) => item.tags?.name)
                          .filter(Boolean)
                          .join('、')}
                      </span>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>

      <Dialog
        open={sourceDetailOpen}
        onOpenChange={(open) => {
          if (!open) setSourceDetailOpen(false);
        }}
      >
        <DialogContent
          className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-3xl"
          onAnimationEnd={(event) => {
            if (event.animationName === 'cczu-dialog-content-out') {
              setSelectedSource(null);
            }
          }}
        >
          {selectedSource && (
            <>
              <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {typeLabel(selectedSource.type)}
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
                  {selectedSource.knowledge_item_id && (
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                      <BookOpen className="h-3 w-3" />
                      已在知识库
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
                  <span>
                    发布于 {formatDate(selectedSource.created_at)}
                  </span>
                  {selectedSource.location && (
                    <span>{selectedSource.location}</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 px-6 py-5">
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {selectedSource.content}
                </div>

                <dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-400">有效期至</dt>
                    <dd className="mt-1 text-slate-700">
                      {formatDate(selectedSource.valid_until)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">联系方式</dt>
                    <dd className="mt-1 text-slate-700">
                      {selectedSource.contact_value ||
                        (selectedSource.contact_mode === 'platform'
                          ? '平台内联系'
                          : '已隐藏')}
                    </dd>
                  </div>
                </dl>

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

                {selectedSource.reject_reason && (
                  <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
                    驳回原因：{selectedSource.reject_reason}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  {user?.role === 'admin' &&
                    selectedSource.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() =>
                          void promoteToKnowledge(selectedSource)
                        }
                        disabled={
                          promotingId === selectedSource.id ||
                          Boolean(selectedSource.knowledge_item_id)
                        }
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                          selectedSource.knowledge_item_id
                            ? 'cursor-default bg-slate-100 text-slate-500'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        )}
                      >
                        <BookOpen className="h-4 w-4" />
                        {selectedSource.knowledge_item_id
                          ? '已收录知识库'
                          : promotingId === selectedSource.id
                            ? '正在转存...'
                            : '转存到知识库'}
                      </button>
                    )}
                  {selectedSource.status === 'draft' &&
                    selectedSource.created_by === user?.id && (
                      <button
                        type="button"
                        onClick={() =>
                          void submitForReview(selectedSource)
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        提交审核
                      </button>
                    )}
                  {canManageSource(selectedSource) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSource(selectedSource);
                        setSourceDetailOpen(false);
                        setTab('create');
                      }}
                      className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                    >
                      修改
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PermanentDeleteDialog
        open={Boolean(deletingSource)}
        itemName={deletingSource?.title || ''}
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeletingSource(null);
            setDeleteError('');
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
