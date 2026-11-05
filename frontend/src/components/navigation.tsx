'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Bot,
  LogIn,
  Menu,
  Newspaper,
  Shapes,
  ShieldCheck,
  Tags,
  X,
} from 'lucide-react';
import { useApp } from './app-provider';
import { AuthDialog } from './auth-dialog';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/chat/', label: 'Agent', icon: Bot },
  { href: '/sources/', label: '信息源', icon: Newspaper },
];

const adminNavItems = [
  { href: '/admin/knowledge/', label: '知识库', icon: BookOpen },
  { href: '/admin/tags/', label: 'Tag 管理', icon: Tags },
  { href: '/admin/source-types/', label: '类型管理', icon: Shapes },
  { href: '/admin/review/', label: '审核后台', icon: ShieldCheck },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

  const renderNavItem = (
    item: (typeof navItems)[number],
    mobile = false
  ) => {
    const Icon = item.icon;
    const active =
      pathname === item.href || pathname?.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        onClick={() => {
          if (mobile) setMobileOpen(false);
        }}
        className={cn(
          mobile
            ? 'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium'
            : 'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition',
          active
            ? 'bg-blue-50 text-blue-700'
            : 'text-slate-600 hover:bg-slate-50'
        )}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">
            <Link
              href="/chat/"
              prefetch={false}
              className="flex shrink-0 items-center gap-2 text-base font-semibold text-slate-900"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Bot className="h-4.5 w-4.5" />
              </span>
              <span className="hidden sm:inline">CCZU All-knowing</span>
              <span className="sm:hidden">CCZU</span>
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {isLoading ? (
                <div
                  className="flex items-center gap-2"
                  aria-label="正在加载导航"
                >
                  {[56, 72, 64, 68, 72].map((width, index) => (
                    <span
                      key={`${width}-${index}`}
                      className="h-7 animate-pulse rounded-md bg-slate-100"
                      style={{ width }}
                    />
                  ))}
                </div>
              ) : (
                <>
                  {navItems.map((item) => renderNavItem(item))}
                  {isAdmin && (
                    <div className="mx-1 h-5 w-px bg-slate-200" />
                  )}
                  {isAdmin &&
                    adminNavItems.map((item) => renderNavItem(item))}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isLoading ? (
                <span className="text-xs text-slate-400">加载中...</span>
              ) : user ? (
                <>
                  {!isAdmin && (
                    <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 sm:inline">
                      {user.display_name}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
                  >
                    退出
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  登录 / 注册
                </button>
              )}

              <button
                type="button"
                onClick={() => setMobileOpen((open) => !open)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 md:hidden"
                aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
              >
                {mobileOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {mobileOpen && (
            <div className="space-y-1 border-t border-slate-100 py-2 md:hidden">
              {isLoading
                ? [0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="mx-3 my-2 h-7 animate-pulse rounded-md bg-slate-100"
                    />
                  ))
                : [...navItems, ...(isAdmin ? adminNavItems : [])].map(
                    (item) => renderNavItem(item, true)
                  )}
            </div>
          )}
        </div>
      </nav>

      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
      />
    </>
  );
}
