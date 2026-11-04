import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { appConfig } from './config.js';
import { isDbConfigured, query } from './db.js';
import { chatRouter } from './routes/chat.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { reviewRouter } from './routes/review.js';
import { searchRouter } from './routes/search.js';
import { sourcesRouter } from './routes/sources.js';
import { switchRoleRouter } from './routes/switch-role.js';
import { tagsRouter } from './routes/tags.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (
          !origin ||
          appConfig.frontendOrigins.includes('*') ||
          appConfig.frontendOrigins.includes(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin not allowed: ${origin}`));
      },
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_request, response) => {
    const databaseConfigured = isDbConfigured();
    let databaseConnected = false;

    if (databaseConfigured) {
      try {
        await query('SELECT 1');
        databaseConnected = true;
      } catch (error) {
        console.error('Database health check failed:', error);
      }
    }

    response.json({
      status: 'ok',
      database_configured: databaseConfigured,
      database_connected: databaseConnected,
      chat_model_configured: Boolean(appConfig.chatModel.apiKey),
      extract_model_configured: Boolean(appConfig.extractModel.apiKey),
      chat_model: appConfig.chatModel.model,
      extract_model: appConfig.extractModel.model,
    });
  });

  app.use('/api/switch-role', switchRoleRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/review', reviewRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/chat', chatRouter);

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found' });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      console.error('Unhandled backend error:', error);
      response.status(500).json({
        error:
          error instanceof Error ? error.message : 'Internal server error',
      });
    }
  );

  return app;
}
