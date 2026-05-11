import {
  createStrategy,
  switchActiveStrategy,
  listStrategies,
  renameStrategy,
  archiveStrategy,
} from '@bp-agent/application';
import type { StrategyRepository, RuntimeConfig } from '@bp-agent/application';
import { isOk } from '@bp-agent/domain';

export interface DispatchDeps {
  repo: StrategyRepository;
  config: RuntimeConfig;
  write: (msg: string) => void;
}

export async function dispatchStrategyCreate(deps: DispatchDeps, slug: string): Promise<void> {
  const result = await createStrategy({ repo: deps.repo, config: deps.config, rawName: slug });

  if (isOk(result)) {
    deps.write(`Strategy "${result.value.name}" created and set as active.`);
    return;
  }

  switch (result.error.tag) {
    case 'NameInvalid':
      deps.write(`Invalid strategy name: ${result.error.reason}`);
      break;
    case 'StrategyAlreadyExists':
      deps.write(`Strategy "${result.error.name}" already exists.`);
      break;
    case 'RepositoryError':
      deps.write(`Could not read strategies file: ${result.error.message}`);
      break;
    case 'ConfigError':
      deps.write(`Error: ${result.error.message}`);
      break;
  }
}

export async function dispatchStrategySwitch(deps: DispatchDeps, slug: string): Promise<void> {
  const result = await switchActiveStrategy({
    repo: deps.repo,
    config: deps.config,
    rawName: slug,
  });

  if (isOk(result)) {
    deps.write(`Switched to: ${result.value.name}`);
    return;
  }

  switch (result.error.tag) {
    case 'NameInvalid':
      deps.write(`Invalid strategy name: ${result.error.reason}`);
      break;
    case 'StrategyNotFound':
      deps.write(`Strategy "${result.error.name}" does not exist.`);
      break;
    case 'StrategyIsArchived':
      deps.write(`Strategy "${result.error.name}" is archived.`);
      break;
    case 'RepositoryError':
      deps.write(`Could not read strategies file: ${result.error.message}`);
      break;
    case 'ConfigError':
      deps.write(`Error: ${result.error.message}`);
      break;
  }
}

export async function dispatchStrategyRename(
  deps: DispatchDeps,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  const result = await renameStrategy({
    repo: deps.repo,
    oldRawName: oldSlug,
    newRawName: newSlug,
  });

  if (isOk(result)) {
    deps.write(`Renamed: ${oldSlug} → ${result.value.name}`);
    return;
  }

  switch (result.error.tag) {
    case 'NameInvalid':
      deps.write(`Invalid strategy name: ${result.error.reason}`);
      break;
    case 'StrategyNotFound':
      deps.write(`Strategy "${result.error.name}" does not exist.`);
      break;
    case 'StrategyAlreadyExists':
      deps.write(`Strategy "${result.error.name}" already exists.`);
      break;
    case 'IllegalTransition':
      deps.write(`Cannot rename: ${result.error.reason}`);
      break;
    case 'RepositoryError':
      deps.write(`Could not read strategies file: ${result.error.message}`);
      break;
  }
}

export async function dispatchStrategyArchive(
  deps: DispatchDeps,
  slug: string,
  reason?: string,
): Promise<void> {
  const archiveDeps = {
    repo: deps.repo,
    config: deps.config,
    rawName: slug,
    ...(reason !== undefined ? { reason } : {}),
  };
  const result = await archiveStrategy(archiveDeps);

  if (isOk(result)) {
    deps.write(`Strategy "${result.value.name}" archived.`);
    return;
  }

  switch (result.error.tag) {
    case 'NameInvalid':
      deps.write(`Invalid strategy name: ${result.error.reason}`);
      break;
    case 'StrategyNotFound':
      deps.write(`Strategy "${result.error.name}" does not exist.`);
      break;
    case 'CannotArchiveActive':
      deps.write(
        `Strategy "${result.error.name}" is currently active. Switch to another strategy first.`,
      );
      break;
    case 'IllegalTransition':
      deps.write(`Cannot archive: ${result.error.reason}`);
      break;
    case 'RepositoryError':
      deps.write(`Could not read strategies file: ${result.error.message}`);
      break;
    case 'ConfigError':
      deps.write(`Error: ${result.error.message}`);
      break;
  }
}

export async function dispatchStrategyList(deps: DispatchDeps, all: boolean): Promise<void> {
  const result = await listStrategies({
    repo: deps.repo,
    config: deps.config,
    includeArchived: all,
  });

  if (!isOk(result)) {
    deps.write(`Could not read strategies file: ${result.error.message}`);
    return;
  }

  const items = result.value;
  if (items.length === 0) {
    deps.write('No strategies found.');
    return;
  }

  const lines = items.map((item) => {
    const marker = item.isActive ? ' (active)' : '';
    const archivedTag = item.status === 'archived' ? ' [archived]' : '';
    return `  ${item.name}${marker}${archivedTag}`;
  });

  deps.write(lines.join('\n'));
}
