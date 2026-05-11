import * as path from 'node:path';
import * as os from 'node:os';
import { JsonFileStrategyRepository, JsonFileRuntimeConfig } from '@bp-agent/external';
import type { StrategyRepository, RuntimeConfig } from '@bp-agent/application';

export interface AppDeps {
  repo: StrategyRepository;
  config: RuntimeConfig;
}

export function createAppDeps(): AppDeps {
  const dataDir = path.join(os.homedir(), '.local', 'share', 'bp-agent');
  const configDir = path.join(os.homedir(), '.config', 'bp-agent');

  return {
    repo: new JsonFileStrategyRepository(path.join(dataDir, 'strategies.json')),
    config: new JsonFileRuntimeConfig(path.join(configDir, 'runtime.json')),
  };
}
