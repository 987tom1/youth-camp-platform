import { env } from './config/env';
import { buildContainer } from './container';
import { seedAll } from './data/seed';
import { buildRoutes, createApp } from './api/http';
import { createLogger } from './utils/logger';

const logger = createLogger('app');

async function main(): Promise<void> {
  logger.info(`Starting Camp Platform in ${env.NODE_ENV} mode...`);
  logger.info(`Persistence: ${env.PERSISTENCE}`);

  const container = await buildContainer();
  logger.info('Container built');

  await seedAll(container);
  logger.info('Seed complete');

  const routes = buildRoutes(container.services);
  const app = createApp(routes, container.services.auth);

  app.listen(env.PORT, () => {
    logger.info(`Camp Platform listening on http://localhost:${env.PORT}`);
    logger.info(`Health: http://localhost:${env.PORT}/health`);
    logger.info(`API:    http://localhost:${env.PORT}/auth/login`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
