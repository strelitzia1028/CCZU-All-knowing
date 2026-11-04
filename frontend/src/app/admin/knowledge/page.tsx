'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface Tag {
  id: string;
  name: string;
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source_level: string;
  review_status: string;
  created_at: string;
  updated_at: string;
  knowledge_item_tags: Array<{ tag_id: string; tags: { id: string; name: string } }> | null;
}

const SOURCE_LEVELS = [
  { value: 'official', label: '官方' },
  { value: 'admin_reviewed', label: '管理员审核' },
  { value: 'user_share', label: '用户分享' },
];

const SOURCE_LEVEL_LABELS: Record<string, string> = {
  official: '官方',
  admin_reviewed: '管理员审核',
  user_share: '用户分享',
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已驳回',
};

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formSourceLevel, setFormSourceLevel] = useState('user_share');
  const [formReviewStatus, setFormReviewStatus] = useState('approved');
  const [formTagIds, setFormTagIds] = useState<string[]>([]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/knowledge');
      const data = await res.json();
      setItems(data.data || []);
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
      setTags(data.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setNow(Date.now());
    fetchItems();
    fetchTags();
  }, []);

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormSourceLevel('user_share');
    setFormReviewStatus('approved');
    setFormTagIds([]);
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (item: KnowledgeItem) => {
    setEditing(item);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormSourceLevel(item.source_level);
    setFormReviewStatus(item.review_status);
    setFormTagIds(item.knowledge_item_tags?.map((t) => t.tag_id) || []);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formTitle || !formContent) return;

    try {
      if (editing) {
        await apiFetch(`/api/knowledge/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            content: formContent,
            source_level: formSourceLevel,
            review_status: formReviewStatus,
            tag_ids: formTagIds,
          }),
        });
      } else {
        await apiFetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            content: formContent,
            source_level: formSourceLevel,
            review_status: formReviewStatus,
            tag_ids: formTagIds,
          }),
        });
      }
      resetForm();
      fetchItems();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该条目吗？')) return;
    try {
      await apiFetch(`/api/knowledge/${id}`, { method: 'DELETE' });
      fetchItems();
    } catch {
      // ignore
    }
  };

  const isDemo = (content: string) => content.startsWith('【示例数据，需替换】');
  const isExpired = (dateStr: string) => {
    const diff = (now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    return diff > 90;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">知识库管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理校区生活知识库条目</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          + 新建条目
        </button>
      </div>

      {/* Demo data warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700">
        ⚠️ 标记为「示例数据」的条目需要替换为真实校区信息，请勿直接用于回答用户。
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? '编辑条目' : '新建条目'}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">正文</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-40 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">来源等级</label>
              <select
                value={formSourceLevel}
                onChange={(e) => setFormSourceLevel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {SOURCE_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">审核状态</label>
              <select
                value={formReviewStatus}
                onChange={(e) => setFormReviewStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() =>
                      setFormTagIds((prev) =>
                        prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                      )
                    }
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
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                {editing ? '保存修改' : '创建'}
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {isDemo(item.content) && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">示例数据</span>
                    )}
                    {isExpired(item.updated_at) && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600">可能过期</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                      {SOURCE_LEVEL_LABELS[item.source_level]}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      {REVIEW_STATUS_LABELS[item.review_status]}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-800">{item.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>更新于 {new Date(item.updated_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                  {item.knowledge_item_tags && item.knowledge_item_tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {item.knowledge_item_tags.map((t) => (
                        <span key={t.tag_id} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                          {t.tags?.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
