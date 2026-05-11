import { useState, type FormEvent } from 'react';
import { isOk } from '@bp-agent/domain';
import type { UseCreateStrategyResult } from '../hooks/useCreateStrategy';
import { ErrorTagMessage } from './ErrorTagMessage';

export interface StrategyCreateFormProps {
  mutation: UseCreateStrategyResult;
}

export function StrategyCreateForm({ mutation }: StrategyCreateFormProps): JSX.Element {
  const [name, setName] = useState('');
  const pending = mutation.status === 'pending';

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (pending) return;
    const result = await mutation.run({ name });
    if (isOk(result)) {
      setName('');
    }
  };

  return (
    <section aria-label="Create Strategy" className="border-b border-gray-200 px-4 py-4">
      <h2 className="mb-2 text-base font-semibold">Create Strategy</h2>
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="flex items-start gap-2"
      >
        <label className="flex-1">
          <span className="sr-only">Strategy name</span>
          <input
            aria-label="Strategy name"
            type="text"
            value={name}
            disabled={pending}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:bg-blue-300"
        >
          {pending ? (
            <span aria-label="Creating Strategy" role="status">
              Creating…
            </span>
          ) : (
            'Create'
          )}
        </button>
      </form>
      {mutation.error ? (
        <div className="mt-2">
          <ErrorTagMessage error={mutation.error} />
        </div>
      ) : null}
    </section>
  );
}
