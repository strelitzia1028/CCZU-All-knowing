'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface Tag {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const fetchTags = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tags');
      const data = await res.json();
      setTags(data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (tag: Tag) => {
    setEditing(tag);
    setFormName(tag.name);
    setFormDesc(tag.description || '');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName) return;

    try {
      if (editing) {
        await apiFetch(`/api/tags/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, description: formDesc || null }),
        });
      } else {
        await apiFetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, description: formDesc || null }),
        });
      }
      resetForm();
      fetchTags();
    } catch {
      // ignore
    }
  };

  const handleToggleStatus = async (tag: Tag) => {
    const newStatus = tag.status === 'active' ? 'disabled' : 'active';
    try {
      await apiFetch(`/api/tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTags();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定停用该标签吗？停用后不再出现在推荐列表。')) return;
    try {
      await apiFetch(`/api/tags/${id}`, { method: 'DELETE' });
      fetchTags();
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Tag 管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理全局标签库，停用后不再推荐</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          + 新建标签
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? '编辑标签' : '新建标签'}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标签名</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="如：食堂"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
              <input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="标签描述（可选）"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                {editing ? '保存' : '创建'}
              </button>
              <button onClick={resetForm} className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">标签名</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">描述</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">状态</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : (
              tags.map((tag) => (
                <tr key={tag.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-block px-2 py-0.5 rounded text-sm font-medium',
                      tag.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                    )}>
                      {tag.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{tag.description || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded',
                      tag.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {tag.status === 'active' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleEdit(tag)}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleToggleStatus(tag)}
                        className="text-xs px-2 py-1 bg-yellow-50 text-yellow-600 rounded hover:bg-yellow-100"
                      >
                        {tag.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button
                        onClick={() => handleDelete(tag.id)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
