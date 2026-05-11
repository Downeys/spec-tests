import 'dotenv/config';
import { envSchema, type Env } from './env.js';

export { envSchema };
export type { Env };

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path[0] ?? '<root>';
      return `  - ${String(key)}: ${issue.message}`;
    });
    process.stderr.write(`Environment configuration is invalid:\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return result.data;
}
