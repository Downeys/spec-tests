import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { isOk } from '@bp-agent/domain';
import { createAppDeps } from './composition-root.js';
import { createApp } from './server.js';
import { bindAndServe, validateHost } from './bind.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4317;

function ensureDataFiles(): void {
  const dataDir = path.join(os.homedir(), '.local', 'share', 'bp-agent');
  const configDir = path.join(os.homedir(), '.config', 'bp-agent');

  for (const dir of [dataDir, configDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e: unknown) {
      console.error(`Failed to create directory: ${dir}`);
      process.exit(1);
    }
  }

  const strategiesPath = path.join(dataDir, 'strategies.json');
  const runtimePath = path.join(configDir, 'runtime.json');

  for (const filePath of [strategiesPath, runtimePath]) {
    try {
      fs.accessSync(path.dirname(filePath), fs.constants.R_OK | fs.constants.W_OK);
    } catch (e: unknown) {
      console.error(`Cannot read or create data file at: ${filePath}`);
      process.exit(1);
    }
  }
}

async function main(): Promise<void> {
  const host = process.env['BP_AGENT_API_HOST'] ?? DEFAULT_HOST;
  const portStr = process.env['BP_AGENT_API_PORT'];
  const port = portStr ? Number(portStr) : DEFAULT_PORT;

  const hostResult = validateHost(host);
  if (hostResult.tag === 'err') {
    console.error(
      `Refused to start: host "${host}" is not allowed. Only 127.0.0.1 and localhost are permitted.`,
    );
    process.exit(1);
  }

  if (Number.isNaN(port) || port < 0 || port > 65535) {
    console.error(`Invalid port: ${portStr ?? ''}`);
    process.exit(1);
  }

  ensureDataFiles();

  const deps = createAppDeps();
  const app = createApp(deps);

  const result = await bindAndServe(app, { host, port });
  if (!isOk(result)) {
    console.error(`Failed to bind: ${result.error.host} is not allowed`);
    process.exit(1);
  }

  console.log(`bp-api listening on ${result.value.url}`);

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    void result.value.close().then(() => {
      process.exit(0);
    });
  });
}

void main();
