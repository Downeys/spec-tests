import { z } from 'zod';

declare const _brand: unique symbol;
export type StrategyId = string & { readonly [_brand]: 'StrategyId' };

export const StrategyIdSchema = z
  .string()
  .uuid()
  .transform((s) => s as StrategyId);

export function newStrategyId(): StrategyId {
  return crypto.randomUUID() as StrategyId;
}
