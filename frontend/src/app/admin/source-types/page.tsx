'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowDownAZ,
  Clock3,
  Pencil,
  Plus,
  Power,
  Save,
  Shapes,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PermanentDeleteDialog } from '@/components/permanent-delete-dialog';
import { SearchFilterBar } from '@/components/search-filter-bar';

interface SourceType {
  id: string;
  value: string;
  label: string;
  description: string | null;
  status: string;
  created_at: string;
}

export default function SourceTypesPage() {
  const [types, setTypes] = useState<SourceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SourceType | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [error, setError] = useState('');
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [deletingType, setDeletingType] = useState<SourceType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [sortMode, setSortMode] = useState<'created' | 'name'>('created');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchName, setMatchName] = useState(true);
  const [matchDescription, setMatchDescription] = useState(true);

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/source-types');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '加载失败');
      setTypes(data.data || []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : '加载失败'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setFormLabel('');
    setFormValue('');
    setFormDescription('');
    setShowForm(false);
    setError('');
    setConfirmCreateOpen(false);
  };

  const handleEdit = (sourceType: SourceType) => {
    setEditing(sourceType);
    setFormLabel(sourceType.label);
    setFormValue(sourceType.value);
    setFormDescription(sourceType.description || '');
    setShowForm(true);
    setError('');
  };

  const saveType = async () => {
    if (!formLabel.trim() || (!editing && !formValue.trim())) return;
    setError('');

    try {
      const response = await apiFetch(
        editing ? `/api/source-types/${editing.id}` : '/api/source-types',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: formLabel,
            value: editing ? undefined : formValue,
            description: formDescription || null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败');
      resetForm();
      fetchTypes();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '保存失败'
      );
    }
  };

  const handleSubmit = () => {
    if (!formLabel.trim() || (!editing && !formValue.trim())) return;
    setError('');

    if (!editing) {
      setConfirmCreateOpen(true);
      return;
    }

    void saveType();
  };

  const handleToggleStatus = async (sourceType: SourceType) => {
    const status = sourceType.status === 'active' ? 'disabled' : 'active';
    try {
      const response = await apiFetch(
        `/api/source-types/${sourceType.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '操作失败');
      fetchTypes();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : '操作失败'
      );
    }
  };

  const handleDelete = async () => {
    if (!deletingType) return;
    setDeleteLoading(true);
    setDeleteError('');

    try {
      const response = await apiFetch(
        `/api/source-types/${deletingType.id}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除失败');
      setDeletingType(null);
      fetchTypes();
    } catch (deleteError) {
      setDeleteError(
        deleteError instanceof Error ? deleteError.message : '删除失败'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('zh-CN');
  const searchedTypes = normalizedSearch
    ? types.filter(
        (sourceType) =>
          (matchName &&
            sourceType.label
              .toLocaleLowerCase('zh-CN')
              .includes(normalizedSearch)) ||
          (matchDescription &&
            (sourceType.description || '')
              .toLocaleLowerCase('zh-CN')
              .includes(normalizedSearch))
      )
    : types;
  const visibleTypes =
    sortMode === 'name'
      ? [...searchedTypes].sort((left, right) =>
          left.label.localeCompare(right.label, 'zh-CN', {
            numeric: true,
            sensitivity: 'base',
          })
        )
      : [...searchedTypes].sort(
          (left, right) =>
            Date.parse(left.created_at) - Date.parse(right.created_at)
        );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <Shapes className="h-6 w-6 text-blue-600" />
            类型管理
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            管理信息源发布时可选择的类型
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
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建类型
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            {editing ? '编辑类型' : '新建类型'}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                类型名称
              </span>
              <input
                value={formLabel}
                onChange={(event) => setFormLabel(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="如：社团活动"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                类型代码
              </span>
              <input
                value={formValue}
                onChange={(event) => setFormValue(event.target.value)}
                disabled={Boolean(editing)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="如：club_activity"
              />
              {editing && (
                <span className="mt-1 block text-xs text-slate-400">
                  类型代码创建后不可修改
                </span>
              )}
            </label>
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              描述
            </span>
            <input
              value={formDescription}
              onChange={(event) => setFormDescription(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="类型用途说明"
            />
          </label>
          <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                handleSubmit();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Save className="h-4 w-4" />
              {editing ? '保存修改' : '创建'}
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
      )}

      {confirmCreateOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <TriangleAlert className="h-5 w-5 text-amber-600" />
              确认创建信息源类型
            </h2>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-700">类型代码</p>
              <p className="mt-1 break-all font-mono text-lg font-semibold text-amber-900">
                {formValue}
              </p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              类型代码创建后不可修改，是否确认创建？
            </p>
            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmCreateOpen(false);
                  setError('');
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveType();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <SearchFilterBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索类型名称或描述"
          primaryLabel="名称"
          secondaryLabel="描述"
          matchPrimary={matchName}
          matchSecondary={matchDescription}
          onScopeChange={(scope) => {
            setMatchName(scope.matchPrimary);
            setMatchDescription(scope.matchSecondary);
          }}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">类型名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">代码</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">描述</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400">
                  加载中...
                </td>
              </tr>
            ) : visibleTypes.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400">
                  {searchQuery ? '没有匹配的类型' : '暂无类型'}
                </td>
              </tr>
            ) : (
              visibleTypes.map((sourceType) => (
                <tr
                  key={sourceType.id}
                  className={cn(
                    sourceType.status === 'active'
                      ? 'hover:bg-slate-50'
                      : 'bg-slate-50 text-slate-400 opacity-60'
                  )}
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    {sourceType.label}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {sourceType.value}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {sourceType.description || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs',
                        sourceType.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {sourceType.status === 'active'
                        ? '启用'
                        : '等待启用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(sourceType)}
                        className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleStatus(sourceType);
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs',
                          sourceType.status === 'active'
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        )}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {sourceType.status === 'active' ? '停用' : '启用'}
                      </button>
                      {sourceType.status === 'disabled' && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingType(sourceType);
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
        open={Boolean(deletingType)}
        itemName={deletingType?.label || ''}
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeletingType(null);
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
