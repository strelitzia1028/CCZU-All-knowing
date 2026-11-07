'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  Bell,
  Bot,
  LogIn,
  Menu,
  Newspaper,
  Settings2,
  Shapes,
  ShieldCheck,
  Tags,
  X,
} from 'lucide-react';
import { useApp } from './app-provider';
import { AuthDialog } from './auth-dialog';
import { AccountSettingsDialog } from './account-settings-dialog';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

const navItems = [
  { href: '/chat/', label: 'Agent', icon: Bot },
  { href: '/sources/', label: '信息源', icon: Newspaper },
  { href: '/knowledge/', label: '知识库', icon: BookOpen },
  { href: '/messages/', label: '消息', icon: Bell },
];

const adminNavItems = [
  { href: '/admin/tags/', label: 'Tag 管理', icon: Tags },
  { href: '/admin/source-types/', label: '类型管理', icon: Shapes },
  { href: '/admin/review/', label: '审核后台', icon: ShieldCheck },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigatingRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const enterTimerRef = useRef<number | null>(null);
  const isAdmin = user?.role === 'admin';
  const availableNavItems = user
    ? navItems
    : navItems.filter(
        (item) =>
          item.href !== '/messages/' && item.href !== '/knowledge/'
      );

  useLayoutEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    main.classList.remove('cczu-page-leave');
    main.classList.remove('cczu-page-transition');
    void main.offsetWidth;
    main.classList.add('cczu-page-transition');
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
    }
    enterTimerRef.current = window.setTimeout(() => {
      main.classList.remove('cczu-page-transition');
      enterTimerRef.current = null;
    }, 300);

    return () => {
      if (enterTimerRef.current) {
        window.clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }
    };
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;
    const loadUnreadCount = async () => {
      try {
        const response = await apiFetch('/api/interactions/unread-count', {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!cancelled && response.ok) {
          setUnreadCount(Number(data?.unread_count || 0));
        }
      } catch {
        // The unread badge is optional when the backend is unavailable.
      }
    };
    const handleRefresh = () => {
      void loadUnreadCount();
    };

    void loadUnreadCount();
    const timer = window.setInterval(() => {
      void loadUnreadCount();
    }, 20_000);
    window.addEventListener('cczu-interactions-updated', handleRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(
        'cczu-interactions-updated',
        handleRefresh
      );
    };
  }, [user]);

  const handleNavClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    mobile: boolean
  ) => {
    if (mobile) setMobileOpen(false);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathname === href
    ) {
      return;
    }

    event.preventDefault();
    if (navigatingRef.current) return;

    const main = document.querySelector('main');
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (!main || reduceMotion) {
      router.push(href);
      return;
    }

    navigatingRef.current = true;
    main.classList.remove('cczu-page-transition');
    main.classList.add('cczu-page-leave');
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = window.setTimeout(() => {
      router.push(href);
      navigatingRef.current = false;
      transitionTimerRef.current = null;
    }, 130);
  };

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
        onClick={(event) => handleNavClick(event, item.href, mobile)}
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
        {item.href === '/messages/' && unreadCount > 0 && (
          <span
            className={cn(
              'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
              active
                ? 'bg-blue-600 text-white'
                : 'bg-red-500 text-white'
            )}
            aria-label={`${unreadCount} 条未读消息`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
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
                  {[56, 72, 64, 68, 72, 64].map((width, index) => (
                    <span
                      key={`${width}-${index}`}
                      className="h-7 animate-pulse rounded-md bg-slate-100"
                      style={{ width }}
                    />
                  ))}
                </div>
              ) : (
                <>
                  {availableNavItems.map((item) => renderNavItem(item))}
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
                    <button
                      type="button"
                      onClick={() => setAccountOpen(true)}
                      className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 sm:inline"
                      title="账号设置"
                    >
                      {user.display_name}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAccountOpen(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="账号设置"
                    aria-label="账号设置"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
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
                : [
                    ...availableNavItems,
                    ...(isAdmin ? adminNavItems : []),
                  ].map((item) => renderNavItem(item, true))}
            </div>
          )}
        </div>
      </nav>

      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
      />
      <AccountSettingsDialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
      />
    </>
  );
}
