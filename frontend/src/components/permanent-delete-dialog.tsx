'use client';

import React from 'react';
import { TriangleAlert } from 'lucide-react';

interface PermanentDeleteDialogProps {
  open: boolean;
  itemName: string;
  loading?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PermanentDeleteDialog({
  open,
  itemName,
  loading = false,
  error,
  onCancel,
  onConfirm,
}: PermanentDeleteDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="permanent-delete-title"
        className="w-full max-w-md rounded-xl border-2 border-red-300 bg-red-50 p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-100 p-2 text-red-600">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="permanent-delete-title"
              className="text-lg font-semibold text-red-800"
            >
              永久删除确认
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-red-700">
              “{itemName}”将被永久删除，你确定要这么做吗？
            </p>
            <p className="mt-1 text-xs text-red-500">
              此操作无法撤销。
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {loading ? '删除中...' : '确认永久删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
