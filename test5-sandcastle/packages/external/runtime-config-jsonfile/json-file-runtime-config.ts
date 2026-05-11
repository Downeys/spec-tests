import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { Result, StrategyId } from '@bp-agent/domain';
import { ok, err, StrategyIdSchema } from '@bp-agent/domain';
import type { RuntimeConfig, ConfigError } from '@bp-agent/application';

const RuntimeConfigFileSchema = z.object({
  schemaVersion: z.literal(1),
  activeStrategyId: StrategyIdSchema.nullable(),
});

type RuntimeConfigFile = z.infer<typeof RuntimeConfigFileSchema>;

export class JsonFileRuntimeConfig implements RuntimeConfig {
  constructor(private readonly filePath: string) {}

  getActiveStrategyId(): Promise<Result<StrategyId | null, ConfigError>> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return Promise.resolve(ok(null));
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const data = RuntimeConfigFileSchema.parse(parsed);
      return Promise.resolve(ok(data.activeStrategyId));
    } catch (e: unknown) {
      return Promise.resolve(err({ tag: 'ConfigError', message: String(e) }));
    }
  }

  setActiveStrategyId(id: StrategyId): Promise<Result<void, ConfigError>> {
    try {
      const data: RuntimeConfigFile = {
        schemaVersion: 1,
        activeStrategyId: id,
      };
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });

      const tmpPath = `${this.filePath}.${String(Date.now())}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
      return Promise.resolve(ok(undefined));
    } catch (e: unknown) {
      return Promise.resolve(err({ tag: 'ConfigError', message: String(e) }));
    }
  }
}
