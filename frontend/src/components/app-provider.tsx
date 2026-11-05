'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { SessionUser } from '@cczu/shared';
import { apiFetch, setSessionToken } from '@/lib/api';

interface AppContextType {
  user: SessionUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    displayName: string,
    password: string
  ) => Promise<void>;
  adminLogin: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  adminLogin: async () => {},
  logout: async () => {},
});

export function useApp() {
  return useContext(AppContext);
}

async function readAuthResponse(response: Response): Promise<SessionUser> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : '认证失败'
    );
  }

  setSessionToken(data.token || null);
  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name,
    role: data.role,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiFetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setUser(data?.user || null);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setUser(await readAuthResponse(response));
  }, []);

  const register = useCallback(
    async (username: string, displayName: string, password: string) => {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          display_name: displayName,
          password,
        }),
      });
      setUser(await readAuthResponse(response));
    },
    []
  );

  const adminLogin = useCallback(async (password: string) => {
    const response = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setUser(await readAuthResponse(response));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setSessionToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        adminLogin,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
