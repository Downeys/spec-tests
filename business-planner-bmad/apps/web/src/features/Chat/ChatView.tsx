import { ScrollArea } from '@/components/ui/scroll-area';

export function ChatView() {
  return (
    <ScrollArea className="h-full" data-testid="chat-column">
      <p className="text-[#a1a1aa] text-sm text-center py-8">Select a project to start chatting.</p>
    </ScrollArea>
  );
}
