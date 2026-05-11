import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Phase 2 plan 02-07 Task 0 — T-02-06 mitigation completion.
// The `fail-on-server-only-import` plugin throws at build time if any UI-graph
// module imports from `src/agents/definitions/*` (these modules use
// `node:fs.readFileSync` at module load and cannot bundle for the browser).
// Pairs with the SERVER-ONLY comment headers added in plan 02-04 Task 3.
function failOnServerOnlyImport() {
  return {
    name: 'fail-on-server-only-import',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      const normalized = source.replace(/\\/g, '/');
      if (
        normalized.includes('src/agents/definitions/') ||
        normalized.startsWith('@/agents/definitions/')
      ) {
        throw new Error(
          `T-02-06 violation: server-only module "${source}" imported from UI-graph file "${importer ?? '<unknown>'}". ` +
            `These modules use node:fs.readFileSync and cannot be bundled for the browser. ` +
            `Move the import to the server side (src/server/, src/agents/coordinator.ts) or refactor.`,
        );
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [failOnServerOnlyImport(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@/onebrain': path.resolve(__dirname, 'src/onebrain'),
      '@/lib': path.resolve(__dirname, 'src/lib'),
      '@/cli': path.resolve(__dirname, 'src/cli'),
      '@/compilation': path.resolve(__dirname, 'src/compilation'),
      '@/ui': path.resolve(__dirname, 'src/ui'),
      '@/server': path.resolve(__dirname, 'src/server'),
      '@/agents': path.resolve(__dirname, 'src/agents'),
      '@/eval': path.resolve(__dirname, 'src/eval'),
    },
  },
  root: 'src/ui',
  // Phase 2 plan 02-01, Task 2 — Vite dev server (port 5173) proxies the three
  // Phase 2 backend endpoints to Hono on 127.0.0.1:3000 so the React app
  // reaches them without CORS. Targets are loopback only (T-02-05 alignment).
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:3000',
      '/chat': { target: 'http://127.0.0.1:3000', changeOrigin: true, ws: false },
      '/recompile': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: false,
      },
    },
  },
});
