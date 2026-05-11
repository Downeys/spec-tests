import { Hono } from 'hono';
import { isOk } from '@bp-agent/domain';
import type { AppDeps } from '../composition-root.js';

export function healthRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/api/health', async (c) => {
    const idResult = await deps.config.getActiveStrategyId();
    if (!isOk(idResult)) {
      return c.json({ status: 'ok', activeStrategy: null });
    }

    const activeId = idResult.value;
    if (activeId === null) {
      return c.json({ status: 'ok', activeStrategy: null });
    }

    const strategyResult = await deps.repo.loadById(activeId);
    if (!isOk(strategyResult) || strategyResult.value === null) {
      if (isOk(strategyResult) && strategyResult.value === null) {
        console.error(
          `Warning: active strategy id ${activeId} not found in repository (dangling reference)`,
        );
      }
      return c.json({ status: 'ok', activeStrategy: null });
    }

    return c.json({ status: 'ok', activeStrategy: strategyResult.value.name });
  });

  return app;
}
