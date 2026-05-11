import { useState } from "react";

export interface ToolCallDisclosureProps {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  durationMs?: number;
  isError?: boolean;
}

export function ToolCallDisclosure(props: ToolCallDisclosureProps) {
  const [open, setOpen] = useState(false);
  const indicator = props.result === undefined
    ? "running"
    : props.isError
    ? "error"
    : `${props.durationMs ?? 0}ms`;
  const color = props.isError ? "text-red-600" : "text-gray-500";

  return (
    <div className={`my-1 text-xs ${color}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-mono hover:underline"
      >
        {open ? "▾" : "▸"} {props.name}({Object.keys(props.input).length} args) — {indicator}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded overflow-x-auto">
          <strong>input:</strong> {JSON.stringify(props.input, null, 2)}
          {"\n\n"}
          <strong>result:</strong>{" "}
          {props.result === undefined
            ? "(pending)"
            : JSON.stringify(props.result, null, 2)}
        </pre>
      )}
    </div>
  );
}
