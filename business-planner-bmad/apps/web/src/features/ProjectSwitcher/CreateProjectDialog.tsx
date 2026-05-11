import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useCreateProjectMutation } from '@/api/projects';
import { useSessionStore } from '@/features/Session';
import { ApiError } from '@/api/client';

interface CreateProjectDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bp-surface text-bp-text border-bp-border">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription className="text-bp-muted">
            Create a new project workspace.
          </DialogDescription>
        </DialogHeader>
        <CreateProjectForm
          onCreated={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CreateProjectFormProps {
  readonly onCreated?: () => void;
}

export function CreateProjectForm({ onCreated }: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const setProjectId = useSessionStore((s) => s.setProjectId);
  const mutation = useCreateProjectMutation();

  const trimmedName = name.trim();
  const nameInvalid = trimmedName.length < 1 || trimmedName.length > 100;
  const descInvalid = description.length > 500;

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientError(null);
    if (nameInvalid) {
      setClientError('Name must be 1-100 characters.');
      return;
    }
    if (descInvalid) {
      setClientError('Description must be at most 500 characters.');
      return;
    }
    mutation.mutate(
      { name: trimmedName, description },
      {
        onSuccess: (project) => {
          setProjectId(project.project_id);
          onCreated?.();
        },
      },
    );
  };

  const serverError = mutation.error;
  const errorMessage =
    clientError ??
    (serverError instanceof ApiError
      ? serverError.envelope.error.message
      : serverError instanceof Error
        ? serverError.message
        : null);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" data-testid="create-project-form">
      <label className="flex flex-col gap-1 text-sm">
        <span>Name</span>
        <input
          data-testid="create-project-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="bg-bp-bg border border-bp-border rounded-md px-3 py-2 text-bp-text focus:outline-none focus:ring-1 focus:ring-bp-accent"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Description</span>
        <Textarea
          data-testid="create-project-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          rows={3}
        />
      </label>
      {errorMessage !== null && (
        <p data-testid="create-project-error" className="text-red-400 text-sm">
          {errorMessage}
        </p>
      )}
      <Button
        type="submit"
        disabled={mutation.isPending}
        data-testid="create-project-submit"
        className="self-end"
      >
        {mutation.isPending ? 'Creating…' : 'Create'}
      </Button>
    </form>
  );
}
