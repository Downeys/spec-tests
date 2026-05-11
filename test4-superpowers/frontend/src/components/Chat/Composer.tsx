import { useState, type FormEvent } from "react";

export interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form
      onSubmit={submit}
      className="flex gap-2 px-3 py-2 border-t border-gray-200 bg-white"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e as unknown as FormEvent);
        }}
        rows={2}
        placeholder="Send a message..."
        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:bg-gray-300"
      >
        Send
      </button>
    </form>
  );
}
