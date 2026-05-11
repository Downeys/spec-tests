import { z } from 'zod';

const PostgresUrlSchema = z
  .string()
  .min(1)
  .refine((s) => s.startsWith('postgres://') || s.startsWith('postgresql://'), {
    message: 'must start with postgres:// or postgresql://',
  });

const OpenBrainConfigSchema = z.object({
  OPENBRAIN_ADMIN_URL: PostgresUrlSchema,
  OPENBRAIN_APP_URL: PostgresUrlSchema,
  VOYAGE_API_KEY: z.string().optional(),
});

export type OpenBrainConfig = z.infer<typeof OpenBrainConfigSchema>;

export function loadOpenBrainConfig(env: NodeJS.ProcessEnv = process.env): OpenBrainConfig {
  const parsed = OpenBrainConfigSchema.safeParse({
    OPENBRAIN_ADMIN_URL: env['OPENBRAIN_ADMIN_URL'],
    OPENBRAIN_APP_URL: env['OPENBRAIN_APP_URL'],
    VOYAGE_API_KEY: env['VOYAGE_API_KEY'],
  });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new OpenBrainConfigError(
      `OpenBrain runtime config invalid before any Postgres connection. ${detail}`,
    );
  }
  if (parsed.data.OPENBRAIN_ADMIN_URL === parsed.data.OPENBRAIN_APP_URL) {
    throw new OpenBrainConfigError(
      'OPENBRAIN_ADMIN_URL and OPENBRAIN_APP_URL must point at different roles ' +
        '(per ADR-0024). They are currently identical, which means the runtime ' +
        'is wired to admin credentials and the append-only invariant is not ' +
        'enforced.',
    );
  }
  return parsed.data;
}

export class OpenBrainConfigError extends Error {
  override readonly name = 'OpenBrainConfigError';
}
