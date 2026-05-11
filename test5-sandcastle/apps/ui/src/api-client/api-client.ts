import { ok, err, type Result } from '@bp-agent/domain';
import {
  healthResponseSchema,
  listStrategiesResponseSchema,
  createStrategyResponseSchema,
  switchActiveStrategyResponseSchema,
  patchStrategyResponseSchema,
  apiErrorBodySchema,
  type HealthResponse,
  type StrategyListItem,
  type CreateStrategyResponse,
  type SwitchActiveStrategyResponse,
  type PatchStrategyResponse,
} from './schemas';
import {
  type ApiError,
  type ApiErrorTag,
  READ_SIDE_ERROR_TAGS,
  CREATE_STRATEGY_ERROR_TAGS,
  SWITCH_ACTIVE_STRATEGY_ERROR_TAGS,
  RENAME_STRATEGY_ERROR_TAGS,
  ARCHIVE_STRATEGY_ERROR_TAGS,
} from './errors';
import { anySignal } from './abort-signal-any';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface CreateApiClientArgs {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ApiClient {
  getHealth(opts?: { signal?: AbortSignal }): Promise<Result<HealthResponse, ApiError>>;
  listStrategies(args: {
    all?: boolean;
    signal?: AbortSignal;
  }): Promise<Result<readonly StrategyListItem[], ApiError>>;
  createStrategy(args: {
    name: string;
    signal?: AbortSignal;
  }): Promise<Result<CreateStrategyResponse['strategy'], ApiError>>;
  switchActiveStrategy(args: {
    name: string;
    signal?: AbortSignal;
  }): Promise<Result<SwitchActiveStrategyResponse['strategy'], ApiError>>;
  renameStrategy(args: {
    name: string;
    newName: string;
    signal?: AbortSignal;
  }): Promise<Result<PatchStrategyResponse['strategy'], ApiError>>;
  archiveStrategy(args: {
    name: string;
    reason?: string;
    signal?: AbortSignal;
  }): Promise<Result<PatchStrategyResponse['strategy'], ApiError>>;
}

interface RequestArgs {
  path: string;
  method?: string;
  jsonBody?: unknown;
  callerSignal: AbortSignal | undefined;
  allowedErrorTags: ReadonlySet<ApiErrorTag>;
}

export function createApiClient(args: CreateApiClientArgs): ApiClient {
  const baseUrl = args.baseUrl.replace(/\/$/, '');
  const fetchImpl = args.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(
    reqArgs: RequestArgs,
    parseSuccess: (body: unknown) => T,
  ): Promise<Result<T, ApiError>> {
    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => {
      timeoutCtl.abort();
    }, timeoutMs);

    const signal = reqArgs.callerSignal
      ? anySignal([timeoutCtl.signal, reqArgs.callerSignal])
      : timeoutCtl.signal;

    const init: RequestInit = { signal, method: reqArgs.method ?? 'GET' };
    if (reqArgs.jsonBody !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(reqArgs.jsonBody);
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${reqArgs.path}`, init);
    } catch {
      clearTimeout(timer);
      if (timeoutCtl.signal.aborted || (reqArgs.callerSignal?.aborted ?? false)) {
        return err({ tag: 'RequestTimeout' });
      }
      return err({ tag: 'NetworkError' });
    }
    clearTimeout(timer);

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.ok) {
      try {
        return ok(parseSuccess(body));
      } catch {
        return err({ tag: 'NetworkError' });
      }
    }

    if (response.status >= 500 && body === null) {
      return err({ tag: 'NetworkError' });
    }

    const parsed = apiErrorBodySchema.safeParse(body);
    if (!parsed.success) {
      return err({ tag: 'NetworkError' });
    }
    const tag = parsed.data.tag as ApiErrorTag;
    if (reqArgs.allowedErrorTags.has(tag)) {
      return err({ tag });
    }
    return err({ tag: 'InternalError' });
  }

  return {
    getHealth(opts) {
      return request(
        {
          path: '/api/health',
          callerSignal: opts?.signal,
          allowedErrorTags: READ_SIDE_ERROR_TAGS,
        },
        (body) => healthResponseSchema.parse(body),
      );
    },
    listStrategies(listArgs) {
      const query = listArgs.all ? '?all=true' : '';
      return request(
        {
          path: `/api/strategies${query}`,
          callerSignal: listArgs.signal,
          allowedErrorTags: READ_SIDE_ERROR_TAGS,
        },
        (body) => listStrategiesResponseSchema.parse(body).items,
      );
    },
    createStrategy(createArgs) {
      return request(
        {
          path: '/api/strategies',
          method: 'POST',
          jsonBody: { name: createArgs.name },
          callerSignal: createArgs.signal,
          allowedErrorTags: CREATE_STRATEGY_ERROR_TAGS,
        },
        (body) => createStrategyResponseSchema.parse(body).strategy,
      );
    },
    switchActiveStrategy(switchArgs) {
      return request(
        {
          path: '/api/strategies/active',
          method: 'PUT',
          jsonBody: { name: switchArgs.name },
          callerSignal: switchArgs.signal,
          allowedErrorTags: SWITCH_ACTIVE_STRATEGY_ERROR_TAGS,
        },
        (body) => switchActiveStrategyResponseSchema.parse(body).strategy,
      );
    },
    renameStrategy(renameArgs) {
      return request(
        {
          path: `/api/strategies/${encodeURIComponent(renameArgs.name)}`,
          method: 'PATCH',
          jsonBody: { newName: renameArgs.newName },
          callerSignal: renameArgs.signal,
          allowedErrorTags: RENAME_STRATEGY_ERROR_TAGS,
        },
        (body) => patchStrategyResponseSchema.parse(body).strategy,
      );
    },
    archiveStrategy(archiveArgs) {
      const body: { archived: true; reason?: string } = { archived: true };
      if (archiveArgs.reason !== undefined) {
        body.reason = archiveArgs.reason;
      }
      return request(
        {
          path: `/api/strategies/${encodeURIComponent(archiveArgs.name)}`,
          method: 'PATCH',
          jsonBody: body,
          callerSignal: archiveArgs.signal,
          allowedErrorTags: ARCHIVE_STRATEGY_ERROR_TAGS,
        },
        (parsed) => patchStrategyResponseSchema.parse(parsed).strategy,
      );
    },
  };
}
