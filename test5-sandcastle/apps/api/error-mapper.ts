import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type {
  CreateStrategyError,
  SwitchActiveStrategyError,
  ListStrategiesError,
  RenameStrategyError,
  ArchiveStrategyError,
} from '@bp-agent/application';

export type UseCaseError =
  | CreateStrategyError
  | SwitchActiveStrategyError
  | ListStrategiesError
  | RenameStrategyError
  | ArchiveStrategyError;

function assertNever(x: never): never {
  throw new Error(`Unexpected error tag: ${(x as { tag: string }).tag}`);
}

export function mapUseCaseError(err: UseCaseError): {
  status: ContentfulStatusCode;
  body: Record<string, unknown>;
} {
  switch (err.tag) {
    case 'NameInvalid':
      return { status: 400, body: { ...err } };
    case 'StrategyNotFound':
      return { status: 404, body: { ...err } };
    case 'StrategyAlreadyExists':
    case 'StrategyIsArchived':
    case 'CannotArchiveActive':
    case 'IllegalTransition':
      return { status: 409, body: { ...err } };
    case 'RepositoryError':
    case 'ConfigError':
      return { status: 500, body: { ...err } };
    default:
      return assertNever(err);
  }
}
