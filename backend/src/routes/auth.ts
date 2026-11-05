import { Router } from 'express';
import { appConfig } from '../config.js';
import { createSessionToken } from '../auth-token.js';
import { query } from '../db.js';
import {
  asyncRoute,
  clearSessionCookie,
  sendApiError,
  setSessionCookie,
} from '../http.js';
import { hashPassword, safeStringEqual, verifyPassword } from '../password.js';
import {
  getCurrentUser,
  getUserByRole,
} from '../session.js';
import type { Role, SessionUser } from '@cczu/shared';

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string;
  role: string;
  password_hash: string | null;
}

function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeDisplayName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toSessionUser(row: ProfileRow): SessionUser {
  return {
    id: row.id,
    username: row.username || undefined,
    display_name: row.display_name,
    role: (row.role === 'admin' ? 'admin' : 'user') as Role,
  };
}

function authResponse(
  response: Parameters<typeof setSessionCookie>[0],
  user: SessionUser
) {
  const token = createSessionToken(user.id);
  setSessionCookie(response, token);
  return response.json({ ...user, token });
}

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncRoute(async (request, response) => {
    try {
      const username = normalizeUsername(request.body?.username);
      const displayName = normalizeDisplayName(request.body?.display_name);
      const password =
        typeof request.body?.password === 'string'
          ? request.body.password
          : '';

      if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        return response.status(400).json({
          error: '用户名需为 3 到 32 位字母、数字或下划线',
        });
      }
      if (displayName.length < 2 || displayName.length > 32) {
        return response.status(400).json({
          error: '昵称需为 2 到 32 个字符',
        });
      }
      if (password.length < 8 || password.length > 72) {
        return response.status(400).json({
          error: '密码需为 8 到 72 个字符',
        });
      }

      const passwordHash = await hashPassword(password);
      const rows = await query<ProfileRow>(
        `INSERT INTO profiles
           (id, username, display_name, role, password_hash)
         VALUES ($1, $2, $3, 'user', $4)
         RETURNING id, username, display_name, role, password_hash`,
        [crypto.randomUUID(), username, displayName, passwordHash]
      );

      return authResponse(response, toSessionUser(rows[0]));
    } catch (error) {
      return sendApiError(response, error, '注册失败');
    }
  })
);

authRouter.post(
  '/login',
  asyncRoute(async (request, response) => {
    try {
      const username = normalizeUsername(request.body?.username);
      const password =
        typeof request.body?.password === 'string'
          ? request.body.password
          : '';
      const rows = await query<ProfileRow>(
        `SELECT id, username, display_name, role, password_hash
         FROM profiles
         WHERE username = $1
         LIMIT 1`,
        [username]
      );
      const profile = rows[0];

      if (
        !profile ||
        !(await verifyPassword(password, profile.password_hash))
      ) {
        return response
          .status(401)
          .json({ error: '用户名或密码错误' });
      }

      return authResponse(response, toSessionUser(profile));
    } catch (error) {
      return sendApiError(response, error, '登录失败');
    }
  })
);

authRouter.post(
  '/admin-login',
  asyncRoute(async (request, response) => {
    try {
      const password =
        typeof request.body?.password === 'string'
          ? request.body.password
          : '';
      if (
        !appConfig.adminPassword ||
        !safeStringEqual(password, appConfig.adminPassword)
      ) {
        return response
          .status(401)
          .json({ error: '管理员密码错误' });
      }

      return authResponse(response, await getUserByRole('admin'));
    } catch (error) {
      return sendApiError(response, error, '管理员登录失败');
    }
  })
);

authRouter.get(
  '/me',
  asyncRoute(async (request, response) => {
    try {
      const user = await getCurrentUser(request);
      return response.json({ user });
    } catch (error) {
      return sendApiError(response, error, '读取登录状态失败');
    }
  })
);

authRouter.post(
  '/logout',
  asyncRoute(async (_request, response) => {
    clearSessionCookie(response);
    return response.json({ success: true });
  })
);
