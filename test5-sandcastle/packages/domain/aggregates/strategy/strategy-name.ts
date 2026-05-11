import { z } from 'zod';
import type { Result } from '../../dtos/result.js';
import { ok, err } from '../../dtos/result.js';

declare const _brand: unique symbol;
export type StrategyName = string & { readonly [_brand]: 'StrategyName' };

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export interface NameInvalid {
  readonly tag: 'NameInvalid';
  readonly reason: string;
}

export const StrategyNameSchema = z
  .string()
  .regex(SLUG_REGEX)
  .min(2)
  .max(64)
  .transform((s) => s as StrategyName);

export function createStrategyName(raw: string): Result<StrategyName, NameInvalid> {
  const parsed = StrategyNameSchema.safeParse(raw);
  if (parsed.success) {
    return ok(parsed.data);
  }
  return err({
    tag: 'NameInvalid',
    reason: `Strategy name must be 2–64 lowercase alphanumeric characters or hyphens, not starting or ending with a hyphen. Got: "${raw}"`,
  });
}
