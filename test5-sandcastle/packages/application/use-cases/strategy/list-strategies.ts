import type { Result } from '@bp-agent/domain';
import { ok, isErr } from '@bp-agent/domain';
import type { StrategyRepository, RepositoryError } from '../../ports/strategy-repository.js';
import type { RuntimeConfig, ConfigError } from '../../ports/runtime-config.js';

export interface StrategyListItem {
  readonly name: string;
  readonly status: 'active' | 'archived';
  readonly isActive: boolean;
}

export type ListStrategiesError = RepositoryError | ConfigError;

export interface ListStrategiesDeps {
  repo: StrategyRepository;
  config: RuntimeConfig;
  includeArchived: boolean;
}

export async function listStrategies(
  deps: ListStrategiesDeps,
): Promise<Result<readonly StrategyListItem[], ListStrategiesError>> {
  const activeIdResult = await deps.config.getActiveStrategyId();
  if (isErr(activeIdResult)) {
    return activeIdResult;
  }
  const activeId = activeIdResult.value;

  const listResult = await deps.repo.listAll({ includeArchived: deps.includeArchived });
  if (isErr(listResult)) {
    return listResult;
  }

  const items: StrategyListItem[] = listResult.value.map((strategy) => ({
    name: strategy.name,
    status: strategy.isArchived ? 'archived' : 'active',
    isActive: strategy.id === activeId,
  }));

  return ok(items);
}
