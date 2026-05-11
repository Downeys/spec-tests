import { useState } from 'react';
import type { Project } from '@bp/shared';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useProjectsQuery } from '@/api/projects';
import { useSessionStore } from '@/features/Session';

import { CreateProjectDialog } from './CreateProjectDialog';

function truncate(name: string, max = 28): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

export function ProjectSwitcher() {
  const projectId = useSessionStore((s) => s.projectId);
  const setProjectId = useSessionStore((s) => s.setProjectId);
  const query = useProjectsQuery();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  if (query.isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled data-testid="project-switcher-trigger">
        Loading projects…
      </Button>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Button variant="ghost" size="sm" disabled data-testid="project-switcher-trigger">
        Projects unavailable
      </Button>
    );
  }

  const projects = query.data;
  const active = projects.find((p) => p.project_id === projectId);
  const label = active ? truncate(active.name) : 'Select project…';

  const handleSelect = (p: Project) => {
    setProjectId(p.project_id);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-testid="project-switcher-trigger"
            className="text-bp-text hover:bg-bp-surface"
          >
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-64 p-1 bg-bp-surface text-bp-text border-bp-border"
          data-testid="project-switcher-popover"
        >
          <div className="max-h-64 overflow-y-auto flex flex-col">
            {projects.length === 0 && (
              <div className="px-3 py-2 text-sm text-bp-muted">No projects yet.</div>
            )}
            {projects.map((p) => (
              <button
                key={p.project_id}
                type="button"
                data-testid={`project-switcher-option-${p.project_id}`}
                onClick={() => {
                  handleSelect(p);
                }}
                className="text-left px-3 py-2 text-sm rounded hover:bg-bp-bg"
              >
                {truncate(p.name)}
              </button>
            ))}
          </div>
          <div className="border-t border-bp-border my-1" />
          <button
            type="button"
            data-testid="project-switcher-new"
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
            className="text-left px-3 py-2 text-sm rounded hover:bg-bp-bg w-full"
          >
            + New project…
          </button>
        </PopoverContent>
      </Popover>
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
