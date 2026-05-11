import { z } from 'zod';

export const strategyListItemSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'archived']),
  isActive: z.boolean(),
});

export const listStrategiesResponseSchema = z.object({
  items: z.array(strategyListItemSchema),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  activeStrategy: z.string().nullable(),
});

export const apiErrorBodySchema = z.object({
  tag: z.string(),
});

export const createStrategyResponseSchema = z.object({
  strategy: strategyListItemSchema,
});

export const switchActiveStrategyResponseSchema = z.object({
  strategy: z.object({ name: z.string() }),
});

export const patchStrategyResponseSchema = z.object({
  strategy: z.object({
    name: z.string(),
    status: z.enum(['active', 'archived']),
  }),
});

export type StrategyListItem = z.infer<typeof strategyListItemSchema>;
export type ListStrategiesResponse = z.infer<typeof listStrategiesResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type CreateStrategyResponse = z.infer<typeof createStrategyResponseSchema>;
export type SwitchActiveStrategyResponse = z.infer<typeof switchActiveStrategyResponseSchema>;
export type PatchStrategyResponse = z.infer<typeof patchStrategyResponseSchema>;
