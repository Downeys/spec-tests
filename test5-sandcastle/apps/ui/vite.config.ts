import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 5173;
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4317';

const apiBaseUrl = process.env['BP_AGENT_API_BASE_URL'] ?? DEFAULT_API_BASE_URL;
const portEnv = process.env['BP_AGENT_UI_PORT'];
const port = portEnv ? Number(portEnv) : DEFAULT_PORT;

const proxyConfig = {
  '/api': {
    target: apiBaseUrl,
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: HOST,
    port,
    strictPort: false,
    proxy: proxyConfig,
  },
  preview: {
    host: HOST,
    port,
    strictPort: false,
    proxy: proxyConfig,
  },
});
