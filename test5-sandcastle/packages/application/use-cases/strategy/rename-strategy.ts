import type { Result, NameInvalid, StrategySnapshot, IllegalTransition } from '@bp-agent/domain';
import { createStrategyName, ok, err, isErr } from '@bp-agent/domain';
import type { StrategyRepository, RepositoryError } from '../../ports/strategy-repository.js';

export interface StrategyNotFound {
  readonly tag: 'StrategyNotFound';
  readonly name: string;
}

export interface StrategyAlreadyExists {
  readonly tag: 'StrategyAlreadyExists';
  readonly name: string;
}

export type RenameStrategyError =
  | NameInvalid
  | StrategyNotFound
  | StrategyAlreadyExists
  | IllegalTransition
  | RepositoryError;

export interface RenameStrategyDeps {
  repo: StrategyRepository;
  oldRawName: string;
  newRawName: string;
}

export async function renameStrategy(
  deps: RenameStrategyDeps,
): Promise<Result<StrategySnapshot, RenameStrategyError>> {
  const oldNameResult = createStrategyName(deps.oldRawName);
  if (isErr(oldNameResult)) {
    return err(oldNameResult.error);
  }

  const newNameResult = createStrategyName(deps.newRawName);
  if (isErr(newNameResult)) {
    return err(newNameResult.error);
  }

  const loadResult = await deps.repo.loadByName(oldNameResult.value);
  if (isErr(loadResult)) {
    return err(loadResult.error);
  }
  if (loadResult.value === null) {
    return err({ tag: 'StrategyNotFound', name: deps.oldRawName });
  }

  const strategy = loadResult.value;

  const duplicateResult = await deps.repo.loadByName(newNameResult.value);
  if (isErr(duplicateResult)) {
    return err(duplicateResult.error);
  }
  if (duplicateResult.value !== null) {
    return err({ tag: 'StrategyAlreadyExists', name: deps.newRawName });
  }

  const renameResult = strategy.rename(newNameResult.value);
  if (isErr(renameResult)) {
    return err(renameResult.error);
  }

  const saveResult = await deps.repo.save(strategy);
  if (isErr(saveResult)) {
    return err(saveResult.error);
  }

  return ok(strategy.snapshot());
}
