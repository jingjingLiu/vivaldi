import 'dotenv/config';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma } from './lib/prisma.js';
import { startScheduler } from './services/scheduledJobs.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'vivaldi-server listening');
  });

  const scheduler = startScheduler();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    scheduler.stop();
    server.close(() => {
      logger.info('http server closed');
    });
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal', err);
  process.exit(1);
});
