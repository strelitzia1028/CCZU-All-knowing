'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  Clock3,
  Search,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface SelectableTag {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
}

interface TagMultiSelectProps {
  tags: SelectableTag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  aiSelectedIds?: string[];
  placeholder?: string;
  disabled?: boolean;
}

const tagCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

export function TagMultiSelect({
  tags,
  selectedIds,
  onChange,
  aiSelectedIds = [],
  placeholder = '选择 Tag',
  disabled = false,
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'created' | 'name'>('created');

  const visibleTags = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = keyword
      ? tags.filter((tag) => tag.name.toLowerCase().includes(keyword))
      : [...tags];
    if (sortMode === 'name') {
      return filtered.sort((left, right) =>
        tagCollator.compare(left.name, right.name)
      );
    }
    return filtered
      .map((tag, index) => ({ tag, index }))
      .sort((left, right) => {
        const leftTime = left.tag.created_at
          ? Date.parse(left.tag.created_at)
          : Number.NaN;
        const rightTime = right.tag.created_at
          ? Date.parse(right.tag.created_at)
          : Number.NaN;
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
          return leftTime - rightTime || left.index - right.index;
        }
        return left.index - right.index;
      })
      .map((entry) => entry.tag);
  }, [search, sortMode, tags]);

  const selectedTags = tags.filter((tag) => selectedIds.includes(tag.id));

  const toggleTag = (tagId: string) => {
    onChange(
      selectedIds.includes(tagId)
        ? selectedIds.filter((id) => id !== tagId)
        : [...selectedIds, tagId]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left text-sm transition',
            open
              ? 'border-blue-400 ring-2 ring-blue-100'
              : 'border-slate-300 hover:border-slate-400',
            disabled && 'cursor-not-allowed bg-slate-100 opacity-60'
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <TagIcon className="h-4 w-4 shrink-0 text-slate-400" />
            {selectedTags.length === 0 ? (
              <span className="text-slate-400">{placeholder}</span>
            ) : (
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {selectedTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    className="max-w-40 truncate rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                  >
                    {tag.name}
                  </span>
                ))}
                {selectedTags.length > 3 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    +{selectedTags.length - 3}
                  </span>
                )}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(36rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-slate-800">
                选择 Tag
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                已选择 {selectedTags.length} 个
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSortMode('created')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
                  sortMode === 'created'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100'
                )}
              >
                <Clock3 className="h-3.5 w-3.5" />
                按创建时间排序
              </button>
              <button
                type="button"
                onClick={() => setSortMode('name')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition',
                  sortMode === 'name'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100'
                )}
              >
                <ArrowDownAZ className="h-3.5 w-3.5" />
                按名称排序
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-white hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                  清空
                </button>
              )}
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="搜索 Tag"
            />
          </label>
        </div>

        <div className="max-h-72 overflow-y-auto p-3">
          {visibleTags.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              没有匹配的 Tag
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((tag) => {
                const selected = selectedIds.includes(tag.id);
                const aiSelected = aiSelectedIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition',
                      aiSelected
                        ? 'bg-blue-600 text-white ring-2 ring-amber-300 ring-offset-1'
                        : selected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
