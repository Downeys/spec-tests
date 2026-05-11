import type { KeyboardEvent } from 'react';

import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  readonly onSubmit?: () => void;
  readonly disabled?: boolean;
}

export function ChatInput({ onSubmit, disabled = true }: ChatInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <Textarea
      data-testid="chat-input"
      placeholder={disabled ? 'Select a project first…' : 'Message the agent…'}
      disabled={disabled}
      rows={1}
      onKeyDown={handleKeyDown}
      className="resize-none min-h-[40px] max-h-[200px]"
    />
  );
}
