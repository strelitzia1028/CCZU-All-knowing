import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  asyncRoute,
  readSessionToken,
  sendApiError,
  setSessionCookie,
} from '../http.js';
import { appConfig } from '../config.js';
import {
  createSessionToken,
  verifySessionToken,
} from '../auth-token.js';
import { getUserById, getUserByRole } from '../session.js';

export const switchRoleRouter = Router();

function passwordMatches(input: unknown): boolean {
  if (typeof input !== 'string' || !appConfig.adminPassword) {
    return false;
  }

  const actual = Buffer.from(input);
  const expected = Buffer.from(appConfig.adminPassword);
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

switchRoleRouter.get(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const token = readSessionToken(request);
      const payload = verifySessionToken(token);
      const user = await getUserById(payload?.sub);
      if (!user) {
        return response.json({
          role: null,
          display_name: null,
          id: null,
        });
      }
      return response.json({ ...user, token });
    } catch (error) {
      return sendApiError(response, error, '读取会话失败');
    }
  })
);

switchRoleRouter.post(
  '/',
  asyncRoute(async (request, response) => {
    try {
      const role =
        request.body?.role === 'admin' ? 'admin' : 'user';

      if (role === 'admin' && !passwordMatches(request.body?.password)) {
        return response
          .status(401)
          .json({ error: '管理员密码错误' });
      }

      const user = await getUserByRole(role);
      const token = createSessionToken(user.id);
      setSessionCookie(response, token);
      return response.json({ ...user, token });
    } catch (error) {
      return sendApiError(response, error, '切换角色失败');
    }
  })
);
