'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '@/components/app-provider';
import { apiFetch } from '@/lib/api';

interface Tag {
  id: string;
  name: string;
  status: string;
}

interface SourceItem {
  id: string;
  title: string;
  content: string;
  type: string;
  contact_mode: string;
  contact_value: string | null;
  valid_until: string | null;
  location: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
  source_tags: Array<{ tag_id: string; tags: { id: string; name: string } }> | null;
}

const SOURCE_TYPES = [
  { value: 'partner', label: '找搭子' },
  { value: 'second_hand', label: '二手交易' },
  { value: 'lost_found', label: '失物招领' },
  { value: 'experience', label: '校园经验' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-600' },
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-700' },
  rejected: { label: '已驳回', color: 'bg-red-100 text-red-700' },
};

export default function SourcesPage() {
  const { user } = useApp();
  const [tab, setTab] = useState<'all' | 'mine' | 'create'>('all');
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState('partner');
  const [formLocation, setFormLocation] = useState('');
  const [formContactMode, setFormContactMode] = useState('platform');
  const [formContactValue, setFormContactValue] = useState('');
  const [formTagIds, setFormTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const status = tab === 'mine' ? 'mine' : '';
      const url = status ? `/api/sources?status=${status}` : '/api/sources';
      const res = await apiFetch(url);
      const data = await res.json();
      setSources(data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await apiFetch('/api/tags');
      const data = await res.json();
      setTags((data.data || []).filter((t: Tag) => t.status === 'active'));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSources();
    fetchTags();
  }, [tab]);

  const handleSubmit = async () => {
    if (!formTitle || !formContent) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/sources', {
        method: 'POST',
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
      });
      if (res.ok) {
        setFormTitle('');
        setFormContent('');
        setFormType('partner');
        setFormLocation('');
        setFormContactMode('platform');
        setFormContactValue('');
        setFormTagIds([]);
        setTab('mine');
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitForReview = async (id: string) => {
    try {
      await apiFetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      });
      fetchSources();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除吗？')) return;
    try {
      await apiFetch(`/api/sources/${id}`, { method: 'DELETE' });
      fetchSources();
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">信息源</h1>
        <button
          onClick={() => setTab(tab === 'create' ? 'all' : 'create')}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          {tab === 'create' ? '返回列表' : '+ 发布'}
        </button>
      </div>

      {tab !== 'create' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('all')}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm',
              tab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            全部
          </button>
          <button
            onClick={() => setTab('mine')}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm',
              tab === 'mine' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            我的发布
          </button>
        </div>
      )}

      {tab === 'create' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">发布新信息</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="请输入标题"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-32 resize-none"
                placeholder="请输入详细内容"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">地点范围</label>
              <input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="如：西太湖校区南门"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">联系方式展示</label>
              <select
                value={formContactMode}
                onChange={(e) => setFormContactMode(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="platform">平台内联系</option>
                <option value="masked">打码显示</option>
                <option value="public">公开展示（需确认）</option>
              </select>
              {formContactMode === 'public' && (
                <input
                  value={formContactValue}
                  onChange={(e) => setFormContactValue(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2"
                  placeholder="联系方式（微信号/手机号等）"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setFormTagIds((prev) =>
                        prev.includes(tag.id)
                          ? prev.filter((id) => id !== tag.id)
                          : [...prev, tag.id]
                      );
                    }}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs',
                      formTagIds.includes(tag.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || !formTitle || !formContent}
              className={cn(
                'w-full py-2.5 rounded-lg text-sm font-medium',
                submitting || !formTitle || !formContent
                  ? 'bg-gray-200 text-gray-400'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {submitting ? '提交中...' : '保存为草稿'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">加载中...</div>
          ) : sources.length === 0 ? (
            <div className="text-center py-12 text-gray-400">暂无信息</div>
          ) : (
            sources.map((source) => (
              <div
                key={source.id}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                        {SOURCE_TYPES.find((t) => t.value === source.type)?.label || source.type}
                      </span>
                      <span className={cn('text-xs px-2 py-0.5 rounded', STATUS_LABELS[source.status]?.color)}>
                        {STATUS_LABELS[source.status]?.label}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-800">{source.title}</h3>
                  </div>
                  {source.status === 'draft' && source.profiles?.display_name === user.display_name && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSubmitForReview(source.id)}
                        className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100"
                      >
                        提交审核
                      </button>
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2 line-clamp-3">{source.content}</p>
                {source.reject_reason && (
                  <div className="mt-2 text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                    驳回原因：{source.reject_reason}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>{source.profiles?.display_name || '匿名'}</span>
                  <span>{new Date(source.created_at).toLocaleDateString('zh-CN')}</span>
                  {source.location && <span>{source.location}</span>}
                </div>
                {source.source_tags && source.source_tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {source.source_tags.map((st) => (
                      <span key={st.tag_id} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        {st.tags?.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
