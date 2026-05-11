import type { Result, StrategySnapshot } from '@bp-agent/domain';
import { createStrategyName, ok, err, isErr } from '@bp-agent/domain';
import type { NameInvalid } from '@bp-agent/domain';
import type { StrategyRepository, RepositoryError } from '../../ports/strategy-repository.js';
import type { RuntimeConfig, ConfigError } from '../../ports/runtime-config.js';

export interface StrategyNotFound {
  readonly tag: 'StrategyNotFound';
  readonly name: string;
}

export interface StrategyIsArchived {
  readonly tag: 'StrategyIsArchived';
  readonly name: string;
}

export type SwitchActiveStrategyError =
  | NameInvalid
  | StrategyNotFound
  | StrategyIsArchived
  | RepositoryError
  | ConfigError;

export interface SwitchActiveStrategyDeps {
  repo: StrategyRepository;
  config: RuntimeConfig;
  rawName: string;
}

export async function switchActiveStrategy(
  deps: SwitchActiveStrategyDeps,
): Promise<Result<StrategySnapshot, SwitchActiveStrategyError>> {
  const nameResult = createStrategyName(deps.rawName);
  if (isErr(nameResult)) {
    return err(nameResult.error);
  }
  const name = nameResult.value;

  const loadResult = await deps.repo.loadByName(name);
  if (isErr(loadResult)) {
    return err(loadResult.error);
  }
  if (loadResult.value === null) {
    return err({ tag: 'StrategyNotFound', name: deps.rawName });
  }

  const strategy = loadResult.value;
  if (strategy.isArchived) {
    return err({ tag: 'StrategyIsArchived', name: deps.rawName });
  }

  const configResult = await deps.config.setActiveStrategyId(strategy.id);
  if (isErr(configResult)) {
    return err(configResult.error);
  }

  return ok(strategy.snapshot());
}
