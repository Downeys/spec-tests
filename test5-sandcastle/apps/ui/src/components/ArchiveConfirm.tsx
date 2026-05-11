import { isOk } from '@bp-agent/domain';
import type { UseArchiveStrategyResult } from '../hooks/useArchiveStrategy';
import { ErrorTagMessage } from './ErrorTagMessage';

export interface ArchiveConfirmProps {
  name: string;
  mutation: UseArchiveStrategyResult;
  onDone: () => void;
}

export function ArchiveConfirm({ name, mutation, onDone }: ArchiveConfirmProps): JSX.Element {
  const pending = mutation.status === 'pending';

  const onYes = async (): Promise<void> => {
    if (pending) return;
    const result = await mutation.run({ name });
    if (isOk(result)) {
      onDone();
    }
  };

  const onCancel = (): void => {
    if (pending) return;
    mutation.reset();
    onDone();
  };

  return (
    <div
      role="group"
      aria-label={`Archive ${name}? confirmation`}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-xs text-gray-700">Archive {name}?</span>
      <button
        type="button"
        onClick={() => {
          void onYes();
        }}
        disabled={pending}
        className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white disabled:bg-red-300"
        aria-label={`Confirm archive ${name}`}
      >
        {pending ? (
          <span aria-label="Archiving" role="status">
            Archiving…
          </span>
        ) : (
          'Yes'
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 disabled:text-gray-400"
        aria-label={`Cancel archive ${name}`}
      >
        Cancel
      </button>
      {mutation.error ? (
        <div className="basis-full">
          <ErrorTagMessage error={mutation.error} />
        </div>
      ) : null}
    </div>
  );
}
