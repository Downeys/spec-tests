import type { ApiError, ApiErrorTag } from '../api-client';

function assertNever(x: never): never {
  throw new Error(`Unexpected ApiError tag: ${JSON.stringify(x)}`);
}

function messageFor(tag: ApiErrorTag): string {
  switch (tag) {
    case 'NetworkError':
      return 'API unreachable.';
    case 'RequestTimeout':
      return 'Request timed out. Check the API process.';
    case 'RepositoryError':
      return 'Storage error. Check the data files.';
    case 'ConfigError':
      return 'Config error. Check ~/.config/bp-agent/runtime.json.';
    case 'InternalError':
      return 'Server error. Check the API process logs.';
    case 'StrategyNotFound':
      return 'Strategy not found. Refreshing list…';
    case 'NameInvalid':
      return 'Name is invalid.';
    case 'StrategyAlreadyExists':
      return 'A Strategy with that name already exists.';
    case 'StrategyIsArchived':
      return 'That Strategy is archived. Restore it before switching.';
    case 'IllegalTransition':
      return 'That state transition is not allowed.';
    case 'CannotArchiveActive':
      return 'Cannot archive the active Strategy. Switch first.';
    default:
      return assertNever(tag);
  }
}

export interface ErrorTagMessageProps {
  error: ApiError;
}

export function ErrorTagMessage({ error }: ErrorTagMessageProps): JSX.Element {
  return (
    <p role="alert" className="text-sm text-red-700">
      {messageFor(error.tag)}
    </p>
  );
}
