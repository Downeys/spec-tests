import { useState, type FormEvent } from 'react';
import { isOk } from '@bp-agent/domain';
import type { UseRenameStrategyResult } from '../hooks/useRenameStrategy';
import { ErrorTagMessage } from './ErrorTagMessage';

export interface StrategyRenameFormProps {
  name: string;
  mutation: UseRenameStrategyResult;
  onDone: () => void;
}

export function StrategyRenameForm({
  name,
  mutation,
  onDone,
}: StrategyRenameFormProps): JSX.Element {
  const [newName, setNewName] = useState(name);
  const pending = mutation.status === 'pending';

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (pending) return;
    const result = await mutation.run({ name, newName });
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
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      aria-label={`Rename ${name}`}
      className="flex items-start gap-2"
    >
      <label className="flex-1">
        <span className="sr-only">New name for {name}</span>
        <input
          aria-label={`New name for ${name}`}
          type="text"
          value={newName}
          disabled={pending}
          onChange={(e) => {
            setNewName(e.target.value);
          }}
          className="w-full rounded border border-gray-300 px-2 py-0.5 text-xs disabled:bg-gray-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white disabled:bg-blue-300"
      >
        {pending ? (
          <span aria-label="Renaming" role="status">
            Renaming…
          </span>
        ) : (
          'Save'
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 disabled:text-gray-400"
      >
        Cancel
      </button>
      {mutation.error ? (
        <div className="basis-full">
          <ErrorTagMessage error={mutation.error} />
        </div>
      ) : null}
    </form>
  );
}
