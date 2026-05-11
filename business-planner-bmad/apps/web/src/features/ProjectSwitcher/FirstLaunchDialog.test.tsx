import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectId } from '@bp/shared';

import { QueryWrapper } from '@/tests/helpers/QueryWrapper';
import { useSessionStore } from '@/features/Session';

import { FirstLaunchDialog } from './FirstLaunchDialog';

const existing: Project = {
  project_id: 'exist-1' as ProjectId,
  name: 'existing-one',
  description: '',
  namespace: 'exist-1',
  created_at: '2026-04-22T00:00:00.000Z' as unknown as Project['created_at'],
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function stubFetch(opts: { list: Project[]; onCreate?: (body: unknown) => Project }) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/projects') && method === 'GET') {
      return Promise.resolve(
        new Response(JSON.stringify(opts.list), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (url.endsWith('/api/projects') && method === 'POST') {
      const raw = init?.body;
      const body = typeof raw === 'string' ? JSON.parse(raw) : undefined;
      const created = opts.onCreate?.(body) ?? {
        project_id: 'new-111' as ProjectId,
        name: (body as { name: string }).name,
        description: (body as { description: string }).description,
        namespace: 'new-111',
        created_at: '2026-04-23T12:00:00.000Z',
      };
      return Promise.resolve(
        new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('FirstLaunchDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ projectId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the create form when no projects exist', async () => {
    stubFetch({ list: [] });

    render(
      <QueryWrapper>
        <FirstLaunchDialog />
      </QueryWrapper>,
    );

    expect(await screen.findByTestId('first-launch-dialog')).toBeInTheDocument();
    expect(await screen.findByTestId('create-project-form')).toBeInTheDocument();
  });

  it('renders the pick list when projects exist', async () => {
    stubFetch({ list: [existing] });

    render(
      <QueryWrapper>
        <FirstLaunchDialog />
      </QueryWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId(`first-launch-option-${existing.project_id}`)).toBeInTheDocument();
    });
  });

  it('selecting a project updates the session store', async () => {
    stubFetch({ list: [existing] });
    const user = userEvent.setup();

    render(
      <QueryWrapper>
        <FirstLaunchDialog />
      </QueryWrapper>,
    );

    const option = await screen.findByTestId(`first-launch-option-${existing.project_id}`);
    await user.click(option);

    expect(useSessionStore.getState().projectId).toBe(existing.project_id);
  });

  it('submitting the create form sets the new project as active', async () => {
    stubFetch({
      list: [],
      onCreate: (body) => ({
        project_id: 'new-abc' as ProjectId,
        name: (body as { name: string }).name,
        description: (body as { description: string }).description,
        namespace: 'new-abc',
        created_at: '2026-04-23T12:00:00.000Z' as unknown as Project['created_at'],
      }),
    });
    const user = userEvent.setup();

    render(
      <QueryWrapper>
        <FirstLaunchDialog />
      </QueryWrapper>,
    );

    await user.type(await screen.findByTestId('create-project-name'), 'new-one');
    await user.click(screen.getByTestId('create-project-submit'));

    await waitFor(() => {
      expect(useSessionStore.getState().projectId).toBe('new-abc');
    });
  });

  it('escape and outside click do not close the dialog', async () => {
    stubFetch({ list: [existing] });
    const user = userEvent.setup();

    render(
      <QueryWrapper>
        <FirstLaunchDialog />
      </QueryWrapper>,
    );

    await screen.findByTestId('first-launch-dialog');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('first-launch-dialog')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.getByTestId('first-launch-dialog')).toBeInTheDocument();
  });
});
