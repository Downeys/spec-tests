import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// eslint-disable-next-line react-refresh/only-export-components
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface QueryWrapperProps {
  readonly children: ReactNode;
  readonly client?: QueryClient;
}

export function QueryWrapper({ children, client }: QueryWrapperProps) {
  const qc = client ?? createTestQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
