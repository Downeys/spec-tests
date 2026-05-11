import { loadEnv } from './config/index.js';

const env = loadEnv();

const { createLogger } = await import('./logging/index.js');
const logger = createLogger(env);

logger.info({ port: env.PORT, host: '127.0.0.1', node_env: env.NODE_ENV }, 'server starting');

const { buildApp } = await import('./buildApp.js');

let app;
try {
  app = await buildApp(env, logger);
} catch (err) {
  logger.error({ err }, 'server failed to initialize');
  process.exit(1);
}

try {
  await app.listen({ host: '127.0.0.1', port: env.PORT });
  logger.info({ port: env.PORT }, 'server listening');
} catch (err) {
  logger.error({ err }, 'server failed to start');
  process.exit(1);
}
