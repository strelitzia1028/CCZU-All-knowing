'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { SessionUser } from '@cczu/shared';
import { apiFetch, setSessionToken } from '@/lib/api';

interface AppContextType {
  user: SessionUser;
  switchRole: (role: 'user' | 'admin', password?: string) => Promise<void>;
}

const AppContext = createContext<AppContextType>({
  user: { id: 'user-001', display_name: '测试用户', role: 'user' },
  switchRole: async () => {},
});

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser>({
    id: 'user-001',
    display_name: '测试用户',
    role: 'user',
  });

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      try {
        const currentResponse = await apiFetch('/api/switch-role', {
          cache: 'no-store',
        });
        const current = await currentResponse.json();

        if (cancelled) return;

        if (current?.id && (current.role === 'user' || current.role === 'admin')) {
          setUser({
            id: current.id,
            display_name: current.display_name,
            role: current.role,
          });
          setSessionToken(current.token || current.id);
          return;
        }

        const createResponse = await apiFetch('/api/switch-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'user' }),
        });
        const created = await createResponse.json();

        if (
          !cancelled &&
          created?.id &&
          (created.role === 'user' || created.role === 'admin')
        ) {
          setUser({
            id: created.id,
            display_name: created.display_name,
            role: created.role,
          });
          setSessionToken(created.token || created.id);
        }
      } catch {
        // Keep the default user state when session initialization is unavailable.
      }
    };

    initializeSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const switchRole = useCallback(async (
    role: 'user' | 'admin',
    password?: string
  ) => {
    const response = await apiFetch('/api/switch-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, password }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data?.error === 'string' ? data.error : '切换角色失败'
      );
    }

    setUser((prev) => ({
      ...prev,
      id: data.id ?? prev.id,
      role: data.role,
      display_name: data.display_name ?? prev.display_name,
    }));
    setSessionToken(data.token || null);
  }, []);

  return (
    <AppContext.Provider value={{ user, switchRole }}>
      {children}
    </AppContext.Provider>
  );
}
