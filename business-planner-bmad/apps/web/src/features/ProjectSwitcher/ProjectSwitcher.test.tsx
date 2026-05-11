import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectId } from '@bp/shared';

import { QueryWrapper } from '@/tests/helpers/QueryWrapper';
import { useSessionStore } from '@/features/Session';

import { ProjectSwitcher } from './ProjectSwitcher';

const projectA: Project = {
  project_id: 'aaaa-1111' as ProjectId,
  name: 'alpha',
  description: '',
  namespace: 'aaaa-1111',
  created_at: '2026-04-22T00:00:00.000Z' as unknown as Project['created_at'],
};

const projectB: Project = {
  project_id: 'bbbb-2222' as ProjectId,
  name: 'beta',
  description: '',
  namespace: 'bbbb-2222',
  created_at: '2026-04-23T00:00:00.000Z' as unknown as Project['created_at'],
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function stubFetchGetList(list: Project[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
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
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ProjectSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ projectId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the active project name in the trigger button', async () => {
    useSessionStore.setState({ projectId: projectA.project_id });
    stubFetchGetList([projectA, projectB]);

    render(
      <QueryWrapper>
        <ProjectSwitcher />
      </QueryWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-trigger')).toHaveTextContent('alpha');
    });
  });

  it('clicking an option calls setProjectId', async () => {
    useSessionStore.setState({ projectId: projectA.project_id });
    stubFetchGetList([projectA, projectB]);
    const user = userEvent.setup();

    render(
      <QueryWrapper>
        <ProjectSwitcher />
      </QueryWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-trigger')).toHaveTextContent('alpha');
    });

    await user.click(screen.getByTestId('project-switcher-trigger'));
    await user.click(await screen.findByTestId(`project-switcher-option-${projectB.project_id}`));

    expect(useSessionStore.getState().projectId).toBe(projectB.project_id);
  });

  it('clicking + New project opens the create dialog', async () => {
    useSessionStore.setState({ projectId: projectA.project_id });
    stubFetchGetList([projectA]);
    const user = userEvent.setup();

    render(
      <QueryWrapper>
        <ProjectSwitcher />
      </QueryWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-trigger')).toHaveTextContent('alpha');
    });

    await user.click(screen.getByTestId('project-switcher-trigger'));
    await user.click(await screen.findByTestId('project-switcher-new'));

    expect(await screen.findByTestId('create-project-form')).toBeInTheDocument();
  });
});
