'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiAutoToggleProps {
  checked: boolean;
  loading?: boolean;
  onChange: (checked: boolean) => void;
}

export function AiAutoToggle({
  checked,
  loading = false,
  onChange,
}: AiAutoToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        checked
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-gray-200 bg-gray-50 text-gray-500'
      )}
    >
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-blue-600' : 'bg-gray-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] duration-200',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
      <Sparkles
        className={cn(
          'h-3.5 w-3.5',
          loading ? 'animate-pulse text-blue-500' : ''
        )}
      />
      AI自动添加
    </button>
  );
}
