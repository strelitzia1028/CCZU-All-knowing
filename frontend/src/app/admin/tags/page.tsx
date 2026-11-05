'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowDownAZ,
  Clock3,
  Pencil,
  Plus,
  Power,
  Save,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { PermanentDeleteDialog } from '@/components/permanent-delete-dialog';

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
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [sortMode, setSortMode] = useState<'created' | 'name'>('created');

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

  const handleDelete = async () => {
    if (!deletingTag) return;
    setDeleteLoading(true);
    setDeleteError('');

    try {
      const response = await apiFetch(`/api/tags/${deletingTag.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '删除失败');
      }
      setDeletingTag(null);
      fetchTags();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : '删除失败'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const visibleTags =
    sortMode === 'name'
      ? [...tags].sort((left, right) =>
          left.name.localeCompare(right.name, 'zh-CN', {
            numeric: true,
            sensitivity: 'base',
          })
        )
      : [...tags].sort(
          (left, right) =>
            Date.parse(left.created_at) - Date.parse(right.created_at)
        );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <Tags className="h-6 w-6 text-blue-600" />
            Tag 管理
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            管理全局标签库，停用后不再推荐
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSortMode('created')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition',
              sortMode === 'created'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            )}
          >
            <Clock3 className="h-4 w-4" />
            按创建时间排序
          </button>
          <button
            type="button"
            onClick={() => setSortMode('name')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition',
              sortMode === 'name'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            )}
          >
            <ArrowDownAZ className="h-4 w-4" />
            按名称排序
          </button>
          <button
            type="button"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建标签
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? '编辑标签' : '新建标签'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                标签名
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="如：食堂"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                描述
              </label>
              <input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="标签描述（可选）"
              />
            </div>
            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Save className="h-4 w-4" />
                {editing ? '保存' : '创建'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">标签名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">描述</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="py-10 text-center text-slate-400">加载中...</td></tr>
            ) : (
              visibleTags.map((tag) => (
                <tr
                  key={tag.id}
                  className={cn(
                    tag.status === 'active'
                      ? 'hover:bg-slate-50'
                      : 'bg-slate-50 text-slate-400 opacity-60'
                  )}
                >
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-block px-2 py-0.5 rounded text-sm font-medium',
                      tag.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      {tag.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{tag.description || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded',
                      tag.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      {tag.status === 'active' ? '启用' : '等待启用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(tag)}
                        className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(tag)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs',
                          tag.status === 'active'
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        )}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {tag.status === 'active' ? '停用' : '启用'}
                      </button>
                      {tag.status === 'disabled' && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingTag(tag);
                            setDeleteError('');
                          }}
                          className="inline-flex items-center gap-1 rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          永久删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PermanentDeleteDialog
        open={Boolean(deletingTag)}
        itemName={deletingTag?.name || ''}
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeletingTag(null);
            setDeleteError('');
          }
        }}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
