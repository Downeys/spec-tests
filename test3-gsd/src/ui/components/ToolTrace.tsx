// src/ui/components/ToolTrace.tsx
// Phase 2 plan 02-07 Task 3 — UI-SPEC component #5 + IC-3 + D-11/D-12.
// Default collapsed (chevron right + summary line). Click to expand
// (chevron rotates to down + per-row tool list). Per-message state is
// independent and ephemeral (resets on page refresh).
//
// Two-channel transparency (D-08): the one-line *prose intent* renders
// as a separate assistant message; ToolTrace sits below the *reply*
// message. This component is data-only — it doesn't fetch; the
// assistant-ui runtime stores per-message tool events keyed by message ID.
//
// Tool-name display strips the `mcp__<server>__` prefix for readability;
// negative-case match by FULL prefix only (not substring) — see plan
// 02-06 SUMMARY for the FULL MCP-prefix matcher discipline this honors.

import { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';

export interface ToolTraceEvent {
  phase: 'start' | 'result';
  tool: string;
  args?: unknown;
  summary?: string;
  agentId?: string;
}

export interface ToolTraceProps {
  events: ToolTraceEvent[];
}

function stripMcpPrefix(tool: string): string {
  // Match `mcp__<server>__<rest>` exactly — strip the server prefix.
  // Falls back to the full string if there's no MCP prefix.
  return tool.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
}

export default function ToolTrace({ events }: ToolTraceProps) {
  const [expanded, setExpanded] = useState(false);
  if (events.length === 0) return null;

  // Build collapsed summary per D-11:
  //   "▸ N tool calls (research, M tavily_extract, K onebrain_write_claim)"
  // Count `start` phase events only so a start+result pair counts once.
  const counts = events
    .filter((e) => e.phase === 'start')
    .reduce<Record<string, number>>((acc, e) => {
      const t = stripMcpPrefix(e.tool);
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const breakdown = Object.entries(counts)
    .map(([tool, n]) => `${n} ${tool}`)
    .join(', ');

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-fit text-xs text-muted-foreground hover:text-foreground transition-colors py-1 inline-flex items-center gap-1"
        aria-expanded={expanded}
      >
        <ChevronRightIcon
          className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        {total} tool calls ({breakdown})
      </button>
      {expanded && (
        <ul className="mt-1 ml-1 space-y-0.5">
          {events.map((e, i) => (
            <li
              key={i}
              className="text-xs leading-5 py-1 px-2 hover:bg-muted rounded-md"
            >
              <span className="font-mono text-foreground">
                {stripMcpPrefix(e.tool)}
              </span>
              <span className="text-muted-foreground">
                {e.phase === 'start' && e.args
                  ? `(${JSON.stringify(e.args).slice(0, 60)})`
                  : ''}
                {e.phase === 'result' && e.summary
                  ? ` → ${e.summary.slice(0, 80)}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
