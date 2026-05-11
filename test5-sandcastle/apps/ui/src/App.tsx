import { useCallback, useMemo, useState } from 'react';
import { createApiClient } from './api-client';
import { useHealth } from './hooks/useHealth';
import { useStrategies } from './hooks/useStrategies';
import { useCreateStrategy } from './hooks/useCreateStrategy';
import { useSwitchActiveStrategy } from './hooks/useSwitchActiveStrategy';
import { useRenameStrategy } from './hooks/useRenameStrategy';
import { useArchiveStrategy } from './hooks/useArchiveStrategy';
import { HealthBanner } from './components/HealthBanner';
import { StrategyList } from './components/StrategyList';
import { StrategyCreateForm } from './components/StrategyCreateForm';

export function App(): JSX.Element {
  const client = useMemo(() => createApiClient({ baseUrl: '' }), []);
  const [showArchived, setShowArchived] = useState(false);
  const [switchingName, setSwitchingName] = useState<string | null>(null);

  const health = useHealth({ client });
  const strategies = useStrategies({ client, all: showArchived });
  const createMutation = useCreateStrategy({ client });
  const switchMutation = useSwitchActiveStrategy({ client });
  const renameMutation = useRenameStrategy({ client });
  const archiveMutation = useArchiveStrategy({ client });

  const onSwitch = useCallback(
    (name: string): void => {
      setSwitchingName(name);
      void switchMutation.run({ name });
    },
    [switchMutation],
  );

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <HealthBanner snapshot={health} />
      <StrategyCreateForm mutation={createMutation} />
      <StrategyList
        data={strategies.data}
        error={strategies.error}
        loading={strategies.loading}
        showArchived={showArchived}
        onToggleShowArchived={setShowArchived}
        switchMutation={switchMutation}
        switchingName={switchingName}
        onSwitch={onSwitch}
        renameMutation={renameMutation}
        archiveMutation={archiveMutation}
      />
    </main>
  );
}
