import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import { appConfig } from './config.js';

export function asyncRoute(
  handler: (
    request: Request,
    response: Response,
    next: NextFunction
  ) => Promise<unknown>
): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function readSessionToken(request: Request): string | undefined {
  const authorization = request.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = request.headers.cookie || '';
  const sidMatch = cookieHeader.match(/(?:^|;\s*)sid=([^;]+)/);
  const raw = sidMatch?.[1];
  return raw ? decodeURIComponent(raw) : undefined;
}

export function setSessionCookie(response: Response, sid: string) {
  response.cookie('sid', sid, {
    httpOnly: true,
    sameSite: appConfig.cookieSecure ? 'none' : 'lax',
    secure: appConfig.cookieSecure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie('sid', {
    path: '/',
  });
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

interface DatabaseError {
  code?: string;
  message?: string;
}

export function sendApiError(
  response: Response,
  error: unknown,
  fallback: string
) {
  if (error instanceof AuthError) {
    return response.status(error.status).json({ error: error.message });
  }

  const databaseError = error as DatabaseError;

  if (databaseError.code === '23505') {
    return response
      .status(409)
      .json({ error: '数据已存在或名称重复' });
  }
  if (databaseError.code === '23503') {
    return response
      .status(409)
      .json({ error: '该记录仍被其他数据引用，无法完成操作' });
  }
  if (databaseError.code === '23502') {
    return response.status(400).json({ error: '缺少必填字段' });
  }

  console.error(fallback, error);
  return response.status(500).json({
    error:
      error instanceof Error && error.message ? error.message : fallback,
  });
}
