import { create } from 'zustand';
import type { ProjectId } from '@bp/shared';
import { closeAllAgentEventStreams } from '@/api/sse';

const STORAGE_KEY = 'bp.session.project_id';

interface SessionState {
  projectId: ProjectId | null;
  setProjectId: (id: ProjectId | null) => void;
}

function readPersisted(): ProjectId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (raw as ProjectId) : null;
  } catch {
    return null;
  }
}

export const useSessionStore = create<SessionState>((set) => ({
  projectId: readPersisted(),
  setProjectId: (id) => {
    // AC8 — tear down any in-flight streams from the outgoing project
    // BEFORE the state transition so late-firing handlers still see the
    // old projectId and write to the correct slice.
    closeAllAgentEventStreams();
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode — ignore */
    }
    set({ projectId: id });
  },
}));

export { STORAGE_KEY as SESSION_STORAGE_KEY };
