import type { Result } from '@bp-agent/domain';
import type { Strategy, StrategyId, StrategyName } from '@bp-agent/domain';

export interface RepositoryError {
  readonly tag: 'RepositoryError';
  readonly kind: 'parse' | 'io';
  readonly message: string;
}

export interface ListAllOptions {
  readonly includeArchived: boolean;
}

export interface StrategyRepository {
  save(strategy: Strategy): Promise<Result<void, RepositoryError>>;
  loadByName(name: StrategyName): Promise<Result<Strategy | null, RepositoryError>>;
  loadById(id: StrategyId): Promise<Result<Strategy | null, RepositoryError>>;
  listAll(opts: ListAllOptions): Promise<Result<readonly Strategy[], RepositoryError>>;
}
