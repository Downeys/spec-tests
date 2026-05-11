export type Result<T, E> =
  | { readonly tag: 'ok'; readonly value: T }
  | { readonly tag: 'err'; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { tag: 'ok', value };
}

export function err<E>(error: E): Result<never, E> {
  return { tag: 'err', error };
}

export function isOk<T, E>(
  result: Result<T, E>,
): result is { readonly tag: 'ok'; readonly value: T } {
  return result.tag === 'ok';
}

export function isErr<T, E>(
  result: Result<T, E>,
): result is { readonly tag: 'err'; readonly error: E } {
  return result.tag === 'err';
}
