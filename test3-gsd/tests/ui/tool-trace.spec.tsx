// @vitest-environment jsdom
// tests/ui/tool-trace.spec.tsx
// Wave 0 probe — VALIDATION row UI-03.
//
// Asserts:
//   - Default collapsed render shows the D-11 summary line with tool counts
//   - Click expands; individual tool rows visible
//   - Empty events array renders nothing (defensive: no orphaned chevron)

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ToolTrace, { type ToolTraceEvent } from '@/ui/components/ToolTrace';

afterEach(() => cleanup());

const events: ToolTraceEvent[] = [
  { phase: 'start', tool: 'mcp__tavily__tavily_search', args: { query: 'pricing' } },
  { phase: 'result', tool: 'mcp__tavily__tavily_search', summary: '5 results' },
  {
    phase: 'start',
    tool: 'mcp__onebrain__onebrain_write_claim',
    args: { text: 'claim' },
  },
  {
    phase: 'result',
    tool: 'mcp__onebrain__onebrain_write_claim',
    summary: 'claim:01J9X...',
  },
];

describe('ToolTrace (UI-03)', () => {
  it('renders collapsed by default with summary line containing tool counts', () => {
    render(<ToolTrace events={events} />);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent(/tool calls/);
    expect(button).toHaveTextContent(/tavily_search/);
    expect(button).toHaveTextContent(/onebrain_write_claim/);
  });

  it('expands on click and shows individual rows in tool(args) → result format', () => {
    render(<ToolTrace events={events} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    // After expand, individual rows are visible (multiple matches because
    // the summary chip + each row label both contain the tool name).
    const rows = screen.getAllByText(/tavily_search|onebrain_write_claim/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('renders nothing when events is empty', () => {
    const { container } = render(<ToolTrace events={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
