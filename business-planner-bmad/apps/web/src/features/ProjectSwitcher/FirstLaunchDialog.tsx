import { useState } from 'react';
import type { Project } from '@bp/shared';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProjectsQuery } from '@/api/projects';
import { useSessionStore } from '@/features/Session';

import { CreateProjectForm } from './CreateProjectDialog';

type Mode = 'loading' | 'pick' | 'create';

function truncate(name: string, max = 40): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

export function FirstLaunchDialog() {
  const setProjectId = useSessionStore((s) => s.setProjectId);
  const query = useProjectsQuery();
  const projects = query.data ?? [];
  const [userChoseCreate, setUserChoseCreate] = useState(false);

  let mode: Mode;
  if (query.isLoading) {
    mode = 'loading';
  } else if (projects.length === 0 || userChoseCreate) {
    mode = 'create';
  } else {
    mode = 'pick';
  }

  const handleSelect = (p: Project) => {
    setProjectId(p.project_id);
  };

  return (
    <Dialog open>
      <DialogContent
        className="bg-bp-surface text-bp-text border-bp-border"
        hideCloseButton
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        data-testid="first-launch-dialog"
      >
        <DialogHeader>
          <DialogTitle>Select or create a project</DialogTitle>
          <DialogDescription className="text-bp-muted">
            You need a project before you can message the agent.
          </DialogDescription>
        </DialogHeader>

        {mode === 'loading' && (
          <p className="text-sm text-bp-muted py-2" data-testid="first-launch-loading">
            Loading projects…
          </p>
        )}

        {mode === 'pick' && projects.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
              {projects.map((p) => (
                <button
                  key={p.project_id}
                  type="button"
                  data-testid={`first-launch-option-${p.project_id}`}
                  onClick={() => {
                    handleSelect(p);
                  }}
                  className="text-left px-3 py-2 text-sm rounded border border-bp-border hover:bg-bp-bg"
                >
                  {truncate(p.name)}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              data-testid="first-launch-switch-to-create"
              onClick={() => {
                setUserChoseCreate(true);
              }}
              className="self-start"
            >
              + New project
            </Button>
          </div>
        )}

        {mode === 'create' && (
          <div className="flex flex-col gap-3">
            {userChoseCreate && projects.length > 0 && (
              <button
                type="button"
                data-testid="first-launch-back"
                onClick={() => {
                  setUserChoseCreate(false);
                }}
                className="self-start text-xs text-bp-muted hover:text-bp-text"
              >
                ← Back to projects
              </button>
            )}
            <CreateProjectForm />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
