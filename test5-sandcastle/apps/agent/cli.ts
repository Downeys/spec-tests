import * as readline from 'node:readline';
import { isOk } from '@bp-agent/domain';
import type { StrategyRepository, RuntimeConfig } from '@bp-agent/application';
import { parseCommand } from './commands/parser.js';
import {
  dispatchStrategyCreate,
  dispatchStrategySwitch,
  dispatchStrategyRename,
  dispatchStrategyArchive,
  dispatchStrategyList,
} from './commands/dispatch.js';

const HELP_TEXT = [
  'Available commands:',
  '  /strategy create <slug>        — Create a new strategy',
  '  /strategy rename <old> <new>   — Rename a strategy',
  '  /strategy archive <slug>       — Archive a strategy (--reason <text>)',
  '  /strategy switch <slug>        — Switch to an existing strategy',
  '  /strategy list [--all]         — List strategies (--all includes archived)',
  '  /help                          — Show this help message',
  '  /exit                          — Exit the REPL',
].join('\n');

const NO_AGENT = 'no agent yet — type `/help` for commands';

export interface ReplDeps {
  repo: StrategyRepository;
  config: RuntimeConfig;
}

async function buildGreeting(config: RuntimeConfig, repo: StrategyRepository): Promise<string> {
  const idResult = await config.getActiveStrategyId();
  if (!isOk(idResult)) {
    return `Could not read config: ${idResult.error.message}`;
  }
  if (idResult.value === null) {
    return 'Welcome to bp-agent. No active strategy — create one with `/strategy create <name>`.';
  }

  const loaded = await repo.loadById(idResult.value);
  if (!isOk(loaded)) {
    return `Could not read strategies file: ${loaded.error.message}`;
  }
  if (loaded.value !== null) {
    return `Welcome to bp-agent. Active strategy: ${loaded.value.name}`;
  }

  return 'Welcome to bp-agent. No active strategy — create one with `/strategy create <name>`.';
}

export async function startRepl(
  deps: ReplDeps,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<readline.Interface> {
  const rl = readline.createInterface({ input, output, prompt: '> ' });

  const write = (msg: string): void => {
    output.write(`${msg}\n`);
  };

  const greeting = await buildGreeting(deps.config, deps.repo);
  write(greeting);
  rl.prompt();

  rl.on('line', (line: string) => {
    const cmd = parseCommand(line);

    switch (cmd.kind) {
      case 'help':
        write(HELP_TEXT);
        break;
      case 'exit':
        rl.close();
        return;
      case 'strategy-create':
        void dispatchStrategyCreate({ repo: deps.repo, config: deps.config, write }, cmd.slug).then(
          () => {
            rl.prompt();
          },
        );
        return;
      case 'strategy-switch':
        void dispatchStrategySwitch({ repo: deps.repo, config: deps.config, write }, cmd.slug).then(
          () => {
            rl.prompt();
          },
        );
        return;
      case 'strategy-archive':
        void dispatchStrategyArchive(
          { repo: deps.repo, config: deps.config, write },
          cmd.slug,
          cmd.reason,
        ).then(() => {
          rl.prompt();
        });
        return;
      case 'strategy-rename':
        void dispatchStrategyRename(
          { repo: deps.repo, config: deps.config, write },
          cmd.oldSlug,
          cmd.newSlug,
        ).then(() => {
          rl.prompt();
        });
        return;
      case 'strategy-list':
        void dispatchStrategyList({ repo: deps.repo, config: deps.config, write }, cmd.all).then(
          () => {
            rl.prompt();
          },
        );
        return;
      case 'unknown':
        write(`Unknown command: ${cmd.raw}`);
        break;
      case 'not-a-command':
        write(NO_AGENT);
        break;
    }

    rl.prompt();
  });

  return rl;
}
