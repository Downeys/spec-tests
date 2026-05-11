import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  webServer: [
    {
      command: "pnpm cli serve",
      port: 8787,
      timeout: 30_000,
      reuseExistingServer: true,
      env: {
        NODE_ENV: "test",
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "fake-key",
        VOYAGE_API_KEY: process.env.VOYAGE_API_KEY ?? "fake-key"
      }
    },
    {
      command: "pnpm --filter frontend dev",
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: true
    }
  ],
  use: {
    baseURL: "http://localhost:5173"
  }
});
