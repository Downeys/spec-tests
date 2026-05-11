import { z } from 'zod';

export interface ActiveStatus {
  readonly tag: 'active';
}
export interface ArchivedStatus {
  readonly tag: 'archived';
  readonly archivedAt: Date;
  readonly reason?: string | undefined;
}

export type StrategyStatus = ActiveStatus | ArchivedStatus;

export const ActiveStatusSchema = z.object({ tag: z.literal('active') });

export const ArchivedStatusSchema = z.object({
  tag: z.literal('archived'),
  archivedAt: z.coerce.date(),
  reason: z.string().optional(),
});

export const StrategyStatusSchema = z.discriminatedUnion('tag', [
  ActiveStatusSchema,
  ArchivedStatusSchema,
]);

export function activeStatus(): ActiveStatus {
  return { tag: 'active' };
}
