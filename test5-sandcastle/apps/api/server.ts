import { Hono } from 'hono';
import { ZodError } from 'zod';
import type { AppDeps } from './composition-root.js';
import { healthRoutes } from './routes/health.js';
import { strategyRoutes } from './routes/strategies.js';

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} ${String(c.res.status)} ${String(duration)}ms`);
  });

  app.onError((error, c) => {
    if (error instanceof SyntaxError) {
      return c.json({ tag: 'MalformedJsonBody' }, 400);
    }
    if (error instanceof ZodError) {
      return c.json({ tag: 'ValidationError', issues: error.issues }, 400);
    }
    console.error(error);
    return c.json({ tag: 'InternalError' }, 500);
  });

  app.route('', healthRoutes(deps));
  app.route('', strategyRoutes(deps));

  return app;
}
