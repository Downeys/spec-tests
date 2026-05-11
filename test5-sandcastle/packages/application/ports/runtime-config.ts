import type { Result } from '@bp-agent/domain';
import type { StrategyId } from '@bp-agent/domain';

export interface ConfigError {
  readonly tag: 'ConfigError';
  readonly message: string;
}

export interface RuntimeConfig {
  getActiveStrategyId(): Promise<Result<StrategyId | null, ConfigError>>;
  setActiveStrategyId(id: StrategyId): Promise<Result<void, ConfigError>>;
}
