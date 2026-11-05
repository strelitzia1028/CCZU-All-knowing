'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from './app-provider';
import { cn } from '@/lib/utils';

type AuthMode = 'login' | 'register' | 'admin';

interface AuthDialogProps {
  open: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
}

export function AuthDialog({
  open,
  initialMode = 'login',
  onClose,
}: AuthDialogProps) {
  const { login, register, adminLogin } = useApp();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setUsername('');
    setDisplayName('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  }, [initialMode, open]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (mode === 'login') {
        await login(username, password);
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          throw new Error('两次输入的密码不一致');
        }
        await register(username, displayName, password);
      } else {
        await adminLogin(password);
      }
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '操作失败'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              {mode === 'login'
                ? '登录账号'
                : mode === 'register'
                  ? '注册账号'
                  : '管理员登录'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {mode === 'admin'
                ? '管理员入口需要独立密码。'
                : '登录后可以聊天、发布信息源和管理个人内容。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {mode !== 'admin' && (
          <div className="mt-5 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
            {(['login', 'register'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError('');
                }}
                className={cn(
                  'rounded-md py-2 text-sm font-medium transition-colors',
                  mode === item
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500'
                )}
              >
                {item === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {mode !== 'admin' && (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  用户名
                </span>
                <input
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="3-32 位字母、数字或下划线"
                />
              </label>
              {mode === 'register' && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">
                    昵称
                  </span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="展示给其他同学的名字"
                  />
                </label>
              )}
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {mode === 'admin' ? '管理员密码' : '密码'}
            </span>
            <input
              autoFocus={mode === 'admin'}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder={mode === 'register' ? '至少 8 个字符' : '请输入密码'}
            />
          </label>

          {mode === 'register' && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                确认密码
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="再次输入密码"
              />
            </label>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting
            ? '处理中...'
            : mode === 'login'
              ? '登录'
              : mode === 'register'
                ? '注册并登录'
                : '进入管理后台'}
        </button>

        {mode === 'admin' ? (
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className="mt-3 w-full text-center text-xs text-gray-500 hover:text-blue-600"
          >
            返回普通用户登录
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode('admin');
              setPassword('');
              setError('');
            }}
            className="mt-3 w-full text-center text-xs text-gray-500 hover:text-blue-600"
          >
            管理员入口
          </button>
        )}
      </form>
    </div>
  );
}
