import { useState } from "react";

export interface MenuProps {
  onCompact: () => void;
  onNewConversation: () => void;
}

export function Menu({ onCompact, onNewConversation }: MenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open menu"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-10">
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onCompact();
            }}
          >
            Compact conversation
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              if (
                confirm(
                  "This deletes the current conversation history. Continue?"
                )
              ) {
                onNewConversation();
              }
            }}
          >
            New conversation
          </button>
          <button
            type="button"
            disabled
            className="w-full text-left px-3 py-2 text-gray-400 cursor-not-allowed"
          >
            Settings (coming soon)
          </button>
        </div>
      )}
    </div>
  );
}
