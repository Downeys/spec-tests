import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  ListProjectsResponse,
  Project,
} from '@bp/shared';
import { api } from './client';

export const PROJECTS_QUERY_KEY = ['projects'] as const;

export function useProjectsQuery() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api<ListProjectsResponse>('/api/projects'),
  });
}

export function useCreateProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectRequest) =>
      api<CreateProjectResponse>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (created: Project) => {
      qc.setQueryData<ListProjectsResponse>(PROJECTS_QUERY_KEY, (prev) =>
        prev ? [created, ...prev] : [created],
      );
    },
  });
}
