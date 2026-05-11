import type { Result, NameInvalid, StrategySnapshot } from '@bp-agent/domain';
import { Strategy, createStrategyName, ok, err, isErr } from '@bp-agent/domain';
import type { StrategyRepository, RepositoryError } from '../../ports/strategy-repository.js';
import type { RuntimeConfig, ConfigError } from '../../ports/runtime-config.js';

export interface StrategyAlreadyExists {
  readonly tag: 'StrategyAlreadyExists';
  readonly name: string;
}

export type CreateStrategyError =
  | NameInvalid
  | StrategyAlreadyExists
  | RepositoryError
  | ConfigError;

export interface CreateStrategyDeps {
  repo: StrategyRepository;
  config: RuntimeConfig;
  rawName: string;
}

export async function createStrategy(
  deps: CreateStrategyDeps,
): Promise<Result<StrategySnapshot, CreateStrategyError>> {
  const nameResult = createStrategyName(deps.rawName);
  if (isErr(nameResult)) {
    return err(nameResult.error);
  }
  const name = nameResult.value;

  const existingResult = await deps.repo.loadByName(name);
  if (isErr(existingResult)) {
    return err(existingResult.error);
  }
  if (existingResult.value !== null) {
    return err({ tag: 'StrategyAlreadyExists', name: deps.rawName });
  }

  const createResult = Strategy.create(deps.rawName);
  if (isErr(createResult)) {
    return err(createResult.error);
  }
  const strategy = createResult.value;

  const saveResult = await deps.repo.save(strategy);
  if (isErr(saveResult)) {
    return err(saveResult.error);
  }

  const configResult = await deps.config.setActiveStrategyId(strategy.id);
  if (isErr(configResult)) {
    return err(configResult.error);
  }

  return ok(strategy.snapshot());
}
