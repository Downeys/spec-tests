import { useState } from 'react';
import type { ApiError, StrategyListItem } from '../api-client';
import type { UseSwitchActiveStrategyResult } from '../hooks/useSwitchActiveStrategy';
import type { UseRenameStrategyResult } from '../hooks/useRenameStrategy';
import type { UseArchiveStrategyResult } from '../hooks/useArchiveStrategy';
import { ErrorTagMessage } from './ErrorTagMessage';
import { StrategyRenameForm } from './StrategyRenameForm';
import { ArchiveConfirm } from './ArchiveConfirm';

type RowMode =
  | { kind: 'default' }
  | { kind: 'renaming'; name: string }
  | { kind: 'confirming-archive'; name: string };

export interface StrategyListProps {
  data: readonly StrategyListItem[] | null;
  error: ApiError | null;
  loading: boolean;
  showArchived: boolean;
  onToggleShowArchived: (next: boolean) => void;
  switchMutation: UseSwitchActiveStrategyResult;
  switchingName: string | null;
  onSwitch: (name: string) => void;
  renameMutation: UseRenameStrategyResult;
  archiveMutation: UseArchiveStrategyResult;
}

export function StrategyList({
  data,
  error,
  loading,
  showArchived,
  onToggleShowArchived,
  switchMutation,
  switchingName,
  onSwitch,
  renameMutation,
  archiveMutation,
}: StrategyListProps): JSX.Element {
  const [mode, setMode] = useState<RowMode>({ kind: 'default' });
  const switchPending = switchMutation.status === 'pending';

  const resetMode = (): void => {
    setMode({ kind: 'default' });
  };

  return (
    <section aria-label="Strategies" className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Strategies</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              onToggleShowArchived(e.target.checked);
            }}
          />
          Show archived
        </label>
      </div>

      {error ? <ErrorTagMessage error={error} /> : null}

      {loading && data === null ? <p className="text-sm text-gray-600">Loading…</p> : null}

      {data !== null && data.length === 0 && !loading ? (
        <p className="text-sm text-gray-600">No Strategies yet.</p>
      ) : null}

      {data !== null && data.length > 0 ? (
        <ul aria-label="Strategy list" className="divide-y divide-gray-200">
          {data.map((s) => {
            const isArchived = s.status === 'archived';
            const showSwitch = !s.isActive && !isArchived;
            const showRename = !isArchived;
            const showArchive = !s.isActive && !isArchived;
            const isThisSwitchPending = switchPending && switchingName === s.name;
            const isRenamingThis = mode.kind === 'renaming' && mode.name === s.name;
            const isConfirmingArchiveThis =
              mode.kind === 'confirming-archive' && mode.name === s.name;

            return (
              <li
                key={s.name}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                aria-label={`Strategy ${s.name}`}
              >
                {isRenamingThis ? (
                  <div className="basis-full">
                    <StrategyRenameForm
                      name={s.name}
                      mutation={renameMutation}
                      onDone={resetMode}
                    />
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      {s.isActive ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                          active
                        </span>
                      ) : null}
                      {isArchived ? (
                        <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                          archived
                        </span>
                      ) : null}
                      {isConfirmingArchiveThis ? (
                        <ArchiveConfirm
                          name={s.name}
                          mutation={archiveMutation}
                          onDone={resetMode}
                        />
                      ) : (
                        <>
                          {showSwitch ? (
                            <button
                              type="button"
                              aria-label={`Switch to ${s.name}`}
                              disabled={switchPending}
                              onClick={() => {
                                onSwitch(s.name);
                              }}
                              className="rounded border border-blue-600 px-2 py-0.5 text-xs font-medium text-blue-700 disabled:border-blue-300 disabled:text-blue-300"
                            >
                              {isThisSwitchPending ? (
                                <span aria-label="Switching" role="status">
                                  Switching…
                                </span>
                              ) : (
                                'Switch'
                              )}
                            </button>
                          ) : null}
                          {showRename ? (
                            <button
                              type="button"
                              aria-label={`Rename ${s.name}`}
                              onClick={() => {
                                renameMutation.reset();
                                setMode({ kind: 'renaming', name: s.name });
                              }}
                              className="rounded border border-gray-400 px-2 py-0.5 text-xs font-medium text-gray-700"
                            >
                              Rename
                            </button>
                          ) : null}
                          {showArchive ? (
                            <button
                              type="button"
                              aria-label={`Archive ${s.name}`}
                              onClick={() => {
                                archiveMutation.reset();
                                setMode({ kind: 'confirming-archive', name: s.name });
                              }}
                              className="rounded border border-red-600 px-2 py-0.5 text-xs font-medium text-red-700"
                            >
                              Archive
                            </button>
                          ) : null}
                        </>
                      )}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {switchMutation.error ? (
        <div className="mt-2">
          <ErrorTagMessage error={switchMutation.error} />
        </div>
      ) : null}
    </section>
  );
}
