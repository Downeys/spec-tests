import { ok, Strategy } from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';
import type { RuntimeConfig, StrategyRepository } from '@bp-agent/application';

export function stubConfig(activeId: StrategyId | null): RuntimeConfig {
  return {
    getActiveStrategyId: () => Promise.resolve(ok(activeId)),
    setActiveStrategyId: () => Promise.resolve(ok(undefined)),
  };
}

export function stubRepo(entries = new Map<StrategyId, Strategy>()): StrategyRepository {
  return {
    save: () => Promise.resolve(ok(undefined)),
    loadByName: (name: StrategyName) =>
      Promise.resolve(ok([...entries.values()].find((s) => s.name === name) ?? null)),
    loadById: (id: StrategyId) => Promise.resolve(ok(entries.get(id) ?? null)),
    listAll: ({ includeArchived }) => {
      const all = [...entries.values()];
      return Promise.resolve(ok(includeArchived ? all : all.filter((s) => !s.isArchived)));
    },
  };
}

export function makeStrategy(id: StrategyId, name: string): Strategy {
  return Strategy.reconstitute({
    id,
    name: name as StrategyName,
    status: { tag: 'active' },
    createdAt: new Date(),
  });
}

export function makeArchivedStrategy(id: StrategyId, name: string): Strategy {
  return Strategy.reconstitute({
    id,
    name: name as StrategyName,
    status: { tag: 'archived', archivedAt: new Date() },
    createdAt: new Date(),
  });
}
