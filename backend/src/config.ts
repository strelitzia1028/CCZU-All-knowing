import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({
  path: fileURLToPath(new URL('../../.env.local', import.meta.url)),
});
config({
  path: fileURLToPath(new URL('../../.env.models', import.meta.url)),
  override: true,
});
config();

const frontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const appConfig = {
  port: Number(process.env.BACKEND_PORT || 4000),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  chatModel: {
    apiKey: process.env.CHAT_API_KEY?.trim() || '',
    baseUrl: (
      process.env.CHAT_BASE_URL ||
      'https://open.bigmodel.cn/api/paas/v4'
    ).replace(/\/+$/, ''),
    model: process.env.CHAT_MODEL?.trim() || 'glm-4-flash-250414',
    temperature: Number(process.env.CHAT_TEMPERATURE || 0.4),
    timeoutMs: Number(process.env.CHAT_TIMEOUT_MS || 180_000),
  },
  extractModel: {
    apiKey: process.env.EXTRACT_API_KEY?.trim() || '',
    baseUrl: (
      process.env.EXTRACT_BASE_URL ||
      'https://open.bigmodel.cn/api/paas/v4'
    ).replace(/\/+$/, ''),
    model: process.env.EXTRACT_MODEL?.trim() || 'glm-4-flash-250414',
    temperature: Number(process.env.EXTRACT_TEMPERATURE || 0.1),
    timeoutMs: Number(process.env.EXTRACT_TIMEOUT_MS || 60_000),
  },
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  frontendOrigins,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};
