import { CompileButton } from "./CompileButton.js";
import { RetrievedItem } from "./RetrievedItem.js";
import type { RetrievedItem as Item } from "../../types.js";

export interface ContextPanelProps {
  retrieved: Item[];
}

export function ContextPanel({ retrieved }: ContextPanelProps) {
  return (
    <aside className="flex flex-col h-full px-3 py-3 bg-gray-50 border-l border-gray-200">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
        Context (live)
      </div>
      <div className="flex-1 overflow-y-auto">
        {retrieved.length === 0 ? (
          <div className="text-xs text-gray-400 italic mt-2">
            What the agent retrieves this turn will appear here.
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-700 mt-1 mb-1">
              Retrieved this turn:
            </div>
            {retrieved.map((it) => (
              <RetrievedItem key={`${it.toolUseId}-${it.summary}`} item={it} />
            ))}
          </>
        )}
      </div>
      <div className="pt-2 border-t border-gray-200">
        <CompileButton />
      </div>
    </aside>
  );
}
