'use client';

import React from 'react';
import { LoaderCircle, LockKeyhole } from 'lucide-react';
import { Navigation } from '@/components/navigation';
import { useApp } from '@/components/app-provider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navigation />
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
            正在验证管理员权限...
          </div>
        </div>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navigation />
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center px-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-700">
              需要管理员权限
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              请通过右上角登录入口使用管理员密码登录
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="cczu-page-transition">{children}</main>
    </div>
  );
}
