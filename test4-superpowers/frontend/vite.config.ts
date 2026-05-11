/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/chat": "http://localhost:8787",
      "/vault": "http://localhost:8787"
    }
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test-setup.ts"]
  }
});
