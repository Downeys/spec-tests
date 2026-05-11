import { useEffect, useState } from 'react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatInput, ChatView } from '@/features/Chat';
import { FirstLaunchDialog, ProjectSwitcher } from '@/features/ProjectSwitcher';
import { useSessionStore } from '@/features/Session';
import { useProjectsQuery } from '@/api/projects';

import { Providers } from './providers';

const SIDEBAR_TABS = ['Intelligence', 'Skeptic', 'Wiki', 'Decisions', 'History'] as const;

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const projectId = useSessionStore((s) => s.projectId);
  const setProjectId = useSessionStore((s) => s.setProjectId);
  const projectsQuery = useProjectsQuery();

  // AC8: clear stale persisted projectId when it no longer exists in the fetched list
  useEffect(() => {
    if (projectId !== null && projectsQuery.data !== undefined) {
      const found = projectsQuery.data.find((p) => p.project_id === projectId);
      if (!found) setProjectId(null);
    }
  }, [projectId, projectsQuery.data, setProjectId]);

  const activeProject = projectsQuery.data?.find((p) => p.project_id === projectId);
  const showFirstLaunch = projectId === null && !projectsQuery.isLoading;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#18181b] text-[#e4e4e7]">
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="w-[320px] p-0 border-r border-[#3f3f46]"
          hideCloseButton
        >
          <SheetTitle className="sr-only">Sidebar</SheetTitle>
          <SheetDescription className="sr-only">
            Intelligence, Skeptic, Wiki, Decisions, and History tabs.
          </SheetDescription>
          <Tabs defaultValue="Intelligence" className="flex flex-col h-full">
            <TabsList className="grid w-full grid-cols-5 flex-none">
              {SIDEBAR_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="text-xs px-1">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
            {SIDEBAR_TABS.map((tab) => (
              <TabsContent key={tab} value={tab} className="flex-1 mt-0">
                <div className="p-3 text-[#a1a1aa] text-sm">No {tab.toLowerCase()} yet.</div>
              </TabsContent>
            ))}
          </Tabs>
        </SheetContent>
      </Sheet>

      <header
        data-testid="top-header"
        className="h-10 flex-none flex items-center px-3 border-b border-[#3f3f46]"
      >
        {projectId !== null ? (
          <ProjectSwitcher />
        ) : (
          <span className="text-sm text-bp-muted">No project</span>
        )}
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <div className="max-w-[800px] mx-auto w-full px-4 py-4 h-full">
            <ChatView />
          </div>
        </div>
        <div className="flex-none border-t border-[#3f3f46] px-4 py-3">
          <div className="max-w-[800px] mx-auto w-full">
            <ChatInput disabled={projectId === null} />
          </div>
        </div>
      </div>

      <div
        data-testid="status-bar"
        className="h-8 flex-none flex items-center justify-between px-3 bg-[#18181b] border-t border-[#3f3f46] text-[#a1a1aa]"
      >
        <div className="flex items-center">
          <button
            data-testid="sidebar-toggle"
            onClick={() => {
              setSidebarOpen(true);
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[#27272a] text-[#a1a1aa]"
            aria-label="Open sidebar"
          >
            ☰
          </button>
          <span data-testid="project-name" className="text-xs ml-2 text-[#a1a1aa]">
            {activeProject ? activeProject.name : 'No project selected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-[120px] h-1.5 rounded-full bg-[#3f3f46]"
            aria-label="context gauge skeleton"
          />
          <span className="text-xs">—%</span>
        </div>
        <span data-testid="cost-meter" className="text-xs">
          —
        </span>
      </div>

      {showFirstLaunch && <FirstLaunchDialog />}
    </div>
  );
}

export function App() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
