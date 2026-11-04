import type { Request } from 'express';
import type { SessionUser } from '@cczu/shared';
import { isDbConfigured, query } from './db.js';
import { AuthError, readSessionToken } from './http.js';
import { verifySessionToken } from './auth-token.js';

interface ProfileRow {
  id: string;
  display_name: string;
  role: string;
}

const FALLBACK_USERS: Record<'user' | 'admin', SessionUser> = {
  admin: {
    id: 'admin-001',
    display_name: '管理员',
    role: 'admin',
  },
  user: {
    id: 'user-001',
    display_name: '测试用户',
    role: 'user',
  },
};

function normalizeRole(role: string): 'user' | 'admin' {
  return role === 'admin' ? 'admin' : 'user';
}

export async function getUserById(
  userId: string | undefined
): Promise<SessionUser | null> {
  if (!userId) return null;

  if (isDbConfigured()) {
    try {
      const rows = await query<ProfileRow>(
        `SELECT id, display_name, role
         FROM profiles
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      const profile = rows[0];
      if (profile) {
        return {
          id: profile.id,
          display_name: profile.display_name,
          role: normalizeRole(profile.role),
        };
      }
    } catch (error) {
      console.error('Profile lookup failed:', error);
    }
  }

  if (userId === FALLBACK_USERS.admin.id) return FALLBACK_USERS.admin;
  if (userId === FALLBACK_USERS.user.id) return FALLBACK_USERS.user;
  return null;
}

export async function getUserByRole(
  role: 'user' | 'admin'
): Promise<SessionUser> {
  if (isDbConfigured()) {
    try {
      const rows = await query<ProfileRow>(
        `SELECT id, display_name, role
         FROM profiles
         WHERE role = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [role]
      );
      const profile = rows[0];
      if (profile) {
        return {
          id: profile.id,
          display_name: profile.display_name,
          role: normalizeRole(profile.role),
        };
      }
    } catch (error) {
      console.error('Profile role lookup failed:', error);
    }
  }

  return FALLBACK_USERS[role];
}

export async function getCurrentUser(
  request: Request
): Promise<SessionUser | null> {
  const payload = verifySessionToken(readSessionToken(request));
  return getUserById(payload?.sub);
}

export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new AuthError('未登录或会话已过期', 401);
  }
  return user;
}

export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = await requireUser(request);
  if (user.role !== 'admin') {
    throw new AuthError('需要管理员权限', 403);
  }
  return user;
}
