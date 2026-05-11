import { Hono } from 'hono';
import { isOk } from '@bp-agent/domain';
import {
  listStrategies,
  createStrategy,
  switchActiveStrategy,
  renameStrategy,
  archiveStrategy,
} from '@bp-agent/application';
import type { AppDeps } from '../composition-root.js';
import { mapUseCaseError } from '../error-mapper.js';
import {
  listStrategiesQuery,
  createStrategyRequest,
  switchActiveStrategyRequest,
  patchStrategyRequest,
} from '../request-schemas.js';
import {
  listStrategiesResponse,
  createStrategyResponse,
  switchActiveStrategyResponse,
  patchStrategyResponse,
} from '../response-schemas.js';

function requireJson(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const ct = c.req.header('content-type') ?? '';
  return ct.includes('application/json');
}

export function strategyRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/api/strategies', async (c) => {
    const query = listStrategiesQuery.parse(c.req.query());
    const result = await listStrategies({
      repo: deps.repo,
      config: deps.config,
      includeArchived: query.all,
    });

    if (!isOk(result)) {
      const { status, body } = mapUseCaseError(result.error);
      return c.json(body, status);
    }

    return c.json(listStrategiesResponse.parse({ items: result.value }));
  });

  app.post('/api/strategies', async (c) => {
    if (!requireJson(c)) return c.json({ tag: 'UnsupportedMediaType' }, 415);
    const body = createStrategyRequest.parse(await c.req.json());
    const result = await createStrategy({
      repo: deps.repo,
      config: deps.config,
      rawName: body.name,
    });

    if (!isOk(result)) {
      const { status, body: errBody } = mapUseCaseError(result.error);
      return c.json(errBody, status);
    }

    const snap = result.value;
    return c.json(
      createStrategyResponse.parse({
        strategy: { name: snap.name, status: snap.status.tag, isActive: true },
      }),
      201,
    );
  });

  app.put('/api/strategies/active', async (c) => {
    if (!requireJson(c)) return c.json({ tag: 'UnsupportedMediaType' }, 415);
    const body = switchActiveStrategyRequest.parse(await c.req.json());
    const result = await switchActiveStrategy({
      repo: deps.repo,
      config: deps.config,
      rawName: body.name,
    });

    if (!isOk(result)) {
      const { status, body: errBody } = mapUseCaseError(result.error);
      return c.json(errBody, status);
    }

    return c.json(switchActiveStrategyResponse.parse({ strategy: { name: result.value.name } }));
  });

  app.patch('/api/strategies/:name', async (c) => {
    if (!requireJson(c)) return c.json({ tag: 'UnsupportedMediaType' }, 415);
    const name = c.req.param('name');
    const body = patchStrategyRequest.parse(await c.req.json());

    if ('newName' in body) {
      const result = await renameStrategy({
        repo: deps.repo,
        oldRawName: name,
        newRawName: body.newName,
      });

      if (!isOk(result)) {
        const { status, body: errBody } = mapUseCaseError(result.error);
        return c.json(errBody, status);
      }

      const snap = result.value;
      return c.json(
        patchStrategyResponse.parse({ strategy: { name: snap.name, status: snap.status.tag } }),
      );
    }

    const result = await archiveStrategy({
      repo: deps.repo,
      config: deps.config,
      rawName: name,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });

    if (!isOk(result)) {
      const { status, body: errBody } = mapUseCaseError(result.error);
      return c.json(errBody, status);
    }

    const snap = result.value;
    return c.json(
      patchStrategyResponse.parse({ strategy: { name: snap.name, status: snap.status.tag } }),
    );
  });

  return app;
}
