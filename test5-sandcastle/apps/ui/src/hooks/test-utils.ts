import { ok, err, type Result } from '@bp-agent/domain';
import type {
  ApiClient,
  ApiError,
  HealthResponse,
  StrategyListItem,
  CreateStrategyResponse,
  SwitchActiveStrategyResponse,
  PatchStrategyResponse,
} from '../api-client';

export interface StubCall {
  method:
    | 'getHealth'
    | 'listStrategies'
    | 'createStrategy'
    | 'switchActiveStrategy'
    | 'renameStrategy'
    | 'archiveStrategy';
  args: unknown;
  signal: AbortSignal | undefined;
}

export interface FakeApiClient extends ApiClient {
  calls: StubCall[];
  setHealth: (r: Result<HealthResponse, ApiError>) => void;
  setListStrategies: (r: Result<readonly StrategyListItem[], ApiError>) => void;
  setCreateStrategy: (r: Result<CreateStrategyResponse['strategy'], ApiError>) => void;
  setSwitchActiveStrategy: (r: Result<SwitchActiveStrategyResponse['strategy'], ApiError>) => void;
  setRenameStrategy: (r: Result<PatchStrategyResponse['strategy'], ApiError>) => void;
  setArchiveStrategy: (r: Result<PatchStrategyResponse['strategy'], ApiError>) => void;
}

export function createFakeApiClient(): FakeApiClient {
  const calls: StubCall[] = [];
  let healthResult: Result<HealthResponse, ApiError> = ok({
    status: 'ok',
    activeStrategy: null,
  });
  let listResult: Result<readonly StrategyListItem[], ApiError> = ok([]);
  let createResult: Result<CreateStrategyResponse['strategy'], ApiError> = ok({
    name: 'placeholder',
    status: 'active',
    isActive: true,
  });
  let switchResult: Result<SwitchActiveStrategyResponse['strategy'], ApiError> = ok({
    name: 'placeholder',
  });
  let renameResult: Result<PatchStrategyResponse['strategy'], ApiError> = ok({
    name: 'placeholder',
    status: 'active',
  });
  let archiveResult: Result<PatchStrategyResponse['strategy'], ApiError> = ok({
    name: 'placeholder',
    status: 'archived',
  });

  return {
    calls,
    setHealth(r) {
      healthResult = r;
    },
    setListStrategies(r) {
      listResult = r;
    },
    setCreateStrategy(r) {
      createResult = r;
    },
    setSwitchActiveStrategy(r) {
      switchResult = r;
    },
    setRenameStrategy(r) {
      renameResult = r;
    },
    setArchiveStrategy(r) {
      archiveResult = r;
    },
    getHealth(opts) {
      calls.push({ method: 'getHealth', args: {}, signal: opts?.signal });
      return Promise.resolve(healthResult);
    },
    listStrategies(args) {
      calls.push({ method: 'listStrategies', args: { all: args.all }, signal: args.signal });
      return Promise.resolve(listResult);
    },
    createStrategy(args) {
      calls.push({ method: 'createStrategy', args: { name: args.name }, signal: args.signal });
      return Promise.resolve(createResult);
    },
    switchActiveStrategy(args) {
      calls.push({
        method: 'switchActiveStrategy',
        args: { name: args.name },
        signal: args.signal,
      });
      return Promise.resolve(switchResult);
    },
    renameStrategy(args) {
      calls.push({
        method: 'renameStrategy',
        args: { name: args.name, newName: args.newName },
        signal: args.signal,
      });
      return Promise.resolve(renameResult);
    },
    archiveStrategy(args) {
      calls.push({
        method: 'archiveStrategy',
        args: { name: args.name, reason: args.reason },
        signal: args.signal,
      });
      return Promise.resolve(archiveResult);
    },
  };
}

export function createDeferredClient(): {
  client: ApiClient;
  resolveList: (r: Result<readonly StrategyListItem[], ApiError>) => void;
  resolveHealth: (r: Result<HealthResponse, ApiError>) => void;
  listCalls: { signal: AbortSignal | undefined }[];
  healthCalls: { signal: AbortSignal | undefined }[];
} {
  const listResolvers: ((r: Result<readonly StrategyListItem[], ApiError>) => void)[] = [];
  const listCalls: { signal: AbortSignal | undefined }[] = [];
  const healthResolvers: ((r: Result<HealthResponse, ApiError>) => void)[] = [];
  const healthCalls: { signal: AbortSignal | undefined }[] = [];

  const client: ApiClient = {
    getHealth(opts) {
      healthCalls.push({ signal: opts?.signal });
      return new Promise((resolve) => healthResolvers.push(resolve));
    },
    listStrategies(args) {
      listCalls.push({ signal: args.signal });
      return new Promise((resolve) => listResolvers.push(resolve));
    },
    createStrategy() {
      return Promise.resolve(err({ tag: 'InternalError' }));
    },
    switchActiveStrategy() {
      return Promise.resolve(err({ tag: 'InternalError' }));
    },
    renameStrategy() {
      return Promise.resolve(err({ tag: 'InternalError' }));
    },
    archiveStrategy() {
      return Promise.resolve(err({ tag: 'InternalError' }));
    },
  };

  return {
    client,
    resolveList: (r) => {
      const next = listResolvers.shift();
      if (next) next(r);
    },
    resolveHealth: (r) => {
      const next = healthResolvers.shift();
      if (next) next(r);
    },
    listCalls,
    healthCalls,
  };
}
