import { createApp } from './app.js';
import { appConfig } from './config.js';
import { getPool, isDbConfigured } from './db.js';

const app = createApp();
const server = app.listen(appConfig.port, appConfig.host, () => {
  console.log(
    `CCZU backend listening on http://${appConfig.host}:${appConfig.port}`
  );
  console.log(
    `Database: ${isDbConfigured() ? 'configured' : 'DATABASE_URL missing'}`
  );
  console.log(`Chat model: ${appConfig.chatModel.model}`);
  console.log(`Extract model: ${appConfig.extractModel.model}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => {
    if (isDbConfigured()) {
      void getPool().end();
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
