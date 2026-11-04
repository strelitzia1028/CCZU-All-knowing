'use client';

import React from 'react';
import { Navigation } from '@/components/navigation';
import { useApp } from '@/components/app-provider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useApp();

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-lg font-semibold text-gray-700">需要管理员权限</h2>
            <p className="text-sm text-gray-500 mt-2">请切换到管理员角色后访问</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main>{children}</main>
    </div>
  );
}
