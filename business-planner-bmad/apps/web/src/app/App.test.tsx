import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectId } from '@bp/shared';

import { useSessionStore } from '@/features/Session';

import { App } from './App';

const existing: Project = {
  project_id: 'seed-1' as ProjectId,
  name: 'seeded-project',
  description: '',
  namespace: 'seed-1',
  created_at: '2026-04-22T00:00:00.000Z' as unknown as Project['created_at'],
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function stubFetchList(list: Project[]) {
  const mock = vi.fn((input: RequestInfo | URL) => {
    const url = urlOf(input);
    if (url.endsWith('/api/projects')) {
      return Promise.resolve(
        new Response(JSON.stringify(list), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', mock);
}

describe('App layout', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ projectId: null });
    stubFetchList([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders Direction B layout regions', () => {
    render(<App />);
    expect(screen.getByTestId('sidebar-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('chat-column')).toBeInTheDocument();
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('top-header')).toBeInTheDocument();
  });

  it('chat input is disabled by default', () => {
    render(<App />);
    expect(screen.getByTestId('chat-input')).toBeDisabled();
  });

  it('chat input enables when a project is active', async () => {
    stubFetchList([existing]);
    useSessionStore.setState({ projectId: existing.project_id });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).not.toBeDisabled();
    });
  });

  it('sidebar opens on toggle click and shows all five tab labels', async () => {
    stubFetchList([existing]);
    useSessionStore.setState({ projectId: existing.project_id });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByText('Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Skeptic')).toBeInTheDocument();
    expect(screen.getByText('Wiki')).toBeInTheDocument();
    expect(screen.getByText('Decisions')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('status bar shows project name placeholder when no project selected', () => {
    render(<App />);
    expect(screen.getByTestId('project-name')).toHaveTextContent('No project selected');
  });

  it('status bar shows active project name when selected', async () => {
    stubFetchList([existing]);
    useSessionStore.setState({ projectId: existing.project_id });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('project-name')).toHaveTextContent('seeded-project');
    });
  });

  it('first-launch dialog absent when project is active', async () => {
    stubFetchList([existing]);
    useSessionStore.setState({ projectId: existing.project_id });
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('first-launch-dialog')).not.toBeInTheDocument();
    });
  });

  it('first-launch dialog closes after selecting a project from the list', async () => {
    stubFetchList([existing]);
    useSessionStore.setState({ projectId: null });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('first-launch-dialog')).toBeInTheDocument();
    });
    await user.click(await screen.findByTestId(`first-launch-option-${existing.project_id}`));
    await waitFor(() => {
      expect(screen.queryByTestId('first-launch-dialog')).not.toBeInTheDocument();
    });
  });

  it('stale localStorage projectId is cleared when project not in fetched list', async () => {
    stubFetchList([]);
    useSessionStore.setState({ projectId: 'deleted-id' as ProjectId });
    render(<App />);
    await waitFor(() => {
      expect(useSessionStore.getState().projectId).toBeNull();
    });
    expect(screen.getByTestId('first-launch-dialog')).toBeInTheDocument();
  });
});
