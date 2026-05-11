export type ApiErrorTag =
  | 'NetworkError'
  | 'RequestTimeout'
  | 'RepositoryError'
  | 'ConfigError'
  | 'InternalError'
  | 'StrategyNotFound'
  | 'NameInvalid'
  | 'StrategyAlreadyExists'
  | 'StrategyIsArchived'
  | 'IllegalTransition'
  | 'CannotArchiveActive';

export interface ApiError {
  readonly tag: ApiErrorTag;
}

export const READ_SIDE_ERROR_TAGS: ReadonlySet<ApiErrorTag> = new Set([
  'RepositoryError',
  'ConfigError',
  'InternalError',
  'StrategyNotFound',
]);

export const CREATE_STRATEGY_ERROR_TAGS: ReadonlySet<ApiErrorTag> = new Set([
  'NameInvalid',
  'StrategyAlreadyExists',
  'RepositoryError',
  'ConfigError',
  'InternalError',
]);

export const SWITCH_ACTIVE_STRATEGY_ERROR_TAGS: ReadonlySet<ApiErrorTag> = new Set([
  'NameInvalid',
  'StrategyNotFound',
  'StrategyIsArchived',
  'RepositoryError',
  'ConfigError',
  'InternalError',
]);

export const RENAME_STRATEGY_ERROR_TAGS: ReadonlySet<ApiErrorTag> = new Set([
  'NameInvalid',
  'StrategyNotFound',
  'StrategyAlreadyExists',
  'IllegalTransition',
  'RepositoryError',
  'ConfigError',
  'InternalError',
]);

export const ARCHIVE_STRATEGY_ERROR_TAGS: ReadonlySet<ApiErrorTag> = new Set([
  'NameInvalid',
  'StrategyNotFound',
  'CannotArchiveActive',
  'IllegalTransition',
  'RepositoryError',
  'ConfigError',
  'InternalError',
]);
