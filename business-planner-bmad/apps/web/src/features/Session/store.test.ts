import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectId } from '@bp/shared';

vi.mock('@/api/sse', () => ({
  closeAllAgentEventStreams: vi.fn(),
}));

import { closeAllAgentEventStreams } from '@/api/sse';
import { useSessionStore } from './store';

const closeAllMock = closeAllAgentEventStreams as unknown as ReturnType<typeof vi.fn>;

describe('useSessionStore.setProjectId', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ projectId: null });
    closeAllMock.mockClear();
  });

  afterEach(() => {
    closeAllMock.mockClear();
  });

  it('persists the new projectId to localStorage', () => {
    useSessionStore.getState().setProjectId('proj-a' as ProjectId);
    expect(localStorage.getItem('bp.session.project_id')).toBe('proj-a');
    expect(useSessionStore.getState().projectId).toBe('proj-a');
  });

  it('clears localStorage when set to null', () => {
    localStorage.setItem('bp.session.project_id', 'stale');
    useSessionStore.getState().setProjectId(null);
    expect(localStorage.getItem('bp.session.project_id')).toBeNull();
    expect(useSessionStore.getState().projectId).toBeNull();
  });

  it('calls closeAllAgentEventStreams BEFORE updating projectId', () => {
    useSessionStore.setState({ projectId: 'proj-a' as ProjectId });

    const order: string[] = [];
    closeAllMock.mockImplementation(() => {
      order.push(`closeAll:${String(useSessionStore.getState().projectId)}`);
    });
    const unsubscribe = useSessionStore.subscribe((state) => {
      order.push(`set:${String(state.projectId)}`);
    });

    useSessionStore.getState().setProjectId('proj-b' as ProjectId);

    unsubscribe();

    expect(order).toEqual(['closeAll:proj-a', 'set:proj-b']);
    expect(closeAllMock).toHaveBeenCalledTimes(1);
  });
});
