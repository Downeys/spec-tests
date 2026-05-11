import type { Result, StrategySnapshot, IllegalTransition, NameInvalid } from '@bp-agent/domain';
import { createStrategyName, ok, err, isErr } from '@bp-agent/domain';
import type { StrategyRepository, RepositoryError } from '../../ports/strategy-repository.js';
import type { RuntimeConfig, ConfigError } from '../../ports/runtime-config.js';

export interface StrategyNotFound {
  readonly tag: 'StrategyNotFound';
  readonly name: string;
}

export interface CannotArchiveActive {
  readonly tag: 'CannotArchiveActive';
  readonly name: string;
}

export type ArchiveStrategyError =
  | NameInvalid
  | StrategyNotFound
  | CannotArchiveActive
  | IllegalTransition
  | RepositoryError
  | ConfigError;

export interface ArchiveStrategyDeps {
  repo: StrategyRepository;
  config: RuntimeConfig;
  rawName: string;
  reason?: string;
  now?: () => Date;
}

export async function archiveStrategy(
  deps: ArchiveStrategyDeps,
): Promise<Result<StrategySnapshot, ArchiveStrategyError>> {
  const nameResult = createStrategyName(deps.rawName);
  if (isErr(nameResult)) {
    return err(nameResult.error);
  }

  const loadResult = await deps.repo.loadByName(nameResult.value);
  if (isErr(loadResult)) {
    return err(loadResult.error);
  }
  if (loadResult.value === null) {
    return err({ tag: 'StrategyNotFound', name: deps.rawName });
  }

  const strategy = loadResult.value;

  const activeIdResult = await deps.config.getActiveStrategyId();
  if (isErr(activeIdResult)) {
    return err(activeIdResult.error);
  }
  if (activeIdResult.value === strategy.id) {
    return err({ tag: 'CannotArchiveActive', name: deps.rawName });
  }

  const archiveResult = strategy.archive(deps.reason, deps.now);
  if (isErr(archiveResult)) {
    return err(archiveResult.error);
  }

  const saveResult = await deps.repo.save(strategy);
  if (isErr(saveResult)) {
    return err(saveResult.error);
  }

  return ok(strategy.snapshot());
}
