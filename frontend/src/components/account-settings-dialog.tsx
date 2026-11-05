'use client';

import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  LoaderCircle,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useApp } from './app-provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AccountSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AccountSettingsDialog({
  open,
  onClose,
}: AccountSettingsDialogProps) {
  const { user, updateDisplayName, changePassword } = useApp();
  const [displayName, setDisplayName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameNotice, setNameNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');

  useEffect(() => {
    if (!open) return;
    setDisplayName(user?.display_name || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNameError('');
    setNameNotice('');
    setPasswordError('');
    setPasswordNotice('');
  }, [open, user?.display_name]);

  if (!user) return null;

  const saveDisplayName = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = displayName.trim();
    setNameError('');
    setNameNotice('');
    if (nextName.length < 2 || nextName.length > 32) {
      setNameError('名称需为 2 到 32 个字符');
      return;
    }
    if (nextName === user.display_name) {
      setNameError('当前名称没有变化');
      return;
    }

    setNameSaving(true);
    try {
      await updateDisplayName(nextName);
      setNameNotice('显示名称已更新');
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : '更新显示名称失败'
      );
    } finally {
      setNameSaving(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('请填写原密码、新密码和确认新密码');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      setPasswordError('新密码需为 8 到 72 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('新密码与确认新密码不一致');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('新密码不能与原密码相同');
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('密码已更新');
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : '修改密码失败'
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            账号设置
          </DialogTitle>
          <DialogDescription>
            修改显示名称或更新登录密码。
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => void saveDisplayName(event)}
          className="border-t border-slate-100 pt-5"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <UserRound className="h-4 w-4 text-blue-600" />
            显示名称
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              其他用户看到的名字
            </span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={32}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-slate-400">
            名称不可与其他用户重复，长度为 2 到 32 个字符。
          </p>
          {nameError && (
            <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
              {nameError}
            </p>
          )}
          {nameNotice && (
            <p className="mt-2 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {nameNotice}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={
                nameSaving || displayName.trim() === user.display_name
              }
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {nameSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存名称
            </button>
          </div>
        </form>

        <form
          onSubmit={(event) => void savePassword(event)}
          className="mt-2 border-t border-slate-100 pt-5"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <KeyRound className="h-4 w-4 text-blue-600" />
            修改密码
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                原密码
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                新密码
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                确认新密码
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            新密码需为 8 到 72 个字符，且不能与原密码相同。
          </p>
          {passwordError && (
            <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
              {passwordError}
            </p>
          )}
          {passwordNotice && (
            <p className="mt-2 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {passwordNotice}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={passwordSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {passwordSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              更新密码
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
