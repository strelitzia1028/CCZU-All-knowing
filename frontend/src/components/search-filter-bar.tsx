'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  primaryLabel: string;
  secondaryLabel: string;
  matchPrimary: boolean;
  matchSecondary: boolean;
  onScopeChange: (scope: {
    matchPrimary: boolean;
    matchSecondary: boolean;
  }) => void;
}

export function SearchFilterBar({
  value,
  onChange,
  placeholder,
  primaryLabel,
  secondaryLabel,
  matchPrimary,
  matchSecondary,
  onScopeChange,
}: SearchFilterBarProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-9 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="清空搜索"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
            title={
              matchPrimary && !matchSecondary
                ? '至少选择一个匹配范围'
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={matchPrimary}
              disabled={matchPrimary && !matchSecondary}
              onChange={() =>
                onScopeChange({
                  matchPrimary: !matchPrimary,
                  matchSecondary,
                })
              }
              className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-50"
            />
            匹配{primaryLabel}
          </label>
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
            title={
              matchSecondary && !matchPrimary
                ? '至少选择一个匹配范围'
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={matchSecondary}
              disabled={matchSecondary && !matchPrimary}
              onChange={() =>
                onScopeChange({
                  matchPrimary,
                  matchSecondary: !matchSecondary,
                })
              }
              className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-50"
            />
            匹配{secondaryLabel}
          </label>
        </div>
      </div>
      {value && (
        <p className="mt-2 text-[11px] text-slate-400">
          当前匹配：
          {[
            matchPrimary ? primaryLabel : '',
            matchSecondary ? secondaryLabel : '',
          ]
            .filter(Boolean)
            .join(' + ')}
        </p>
      )}
    </div>
  );
}
