'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './app-provider';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/chat', label: '智能对话', icon: '💬' },
  { href: '/sources', label: '信息源', icon: '📋' },
];

const adminNavItems = [
  { href: '/admin/knowledge', label: '知识库管理', icon: '📚' },
  { href: '/admin/tags', label: 'Tag 管理', icon: '🏷️' },
  { href: '/admin/review', label: '审核后台', icon: '✅' },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, switchRole } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const isAdmin = user.role === 'admin';

  const handleRoleClick = async () => {
    if (isAdmin) {
      await switchRole('user');
      return;
    }
    setAdminPassword('');
    setLoginError('');
    setAdminDialogOpen(true);
  };

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      await switchRole('admin', adminPassword);
      setAdminDialogOpen(false);
      setAdminPassword('');
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : '管理员密码错误'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/chat" className="flex items-center gap-2 font-bold text-lg text-blue-600">
            <span>🎓</span>
            <span className="hidden sm:inline">常大西太湖互助</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  pathname === item.href || pathname?.startsWith(item.href + '/')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                {adminNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      pathname === item.href
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <span className="mr-1">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Role switcher */}
            <button
              onClick={() => {
                void handleRoleClick();
              }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                isAdmin
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {isAdmin ? '管理员' : '普通用户'}
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden pb-3 border-t border-gray-100 pt-2">
            {[...navItems, ...(isAdmin ? adminNavItems : [])].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block px-3 py-2 rounded-md text-sm font-medium',
                  pathname === item.href
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      </nav>

      {adminDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <form
            onSubmit={(event) => {
              void handleAdminLogin(event);
            }}
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-gray-800">管理员登录</h2>
            <p className="mt-1 text-sm text-gray-500">
              输入管理员密码后才能访问管理后台。
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              管理员密码
            </label>
            <input
              autoFocus
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="请输入管理员密码"
            />
            {loginError && (
              <p className="mt-2 text-sm text-red-600">{loginError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdminDialogOpen(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loginLoading || !adminPassword}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {loginLoading ? '验证中...' : '进入后台'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
