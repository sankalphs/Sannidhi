import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ENABLE_DEV_LOGIN: "1",
      SESSION_SECRET: "e2e-playwright-session-secret-0123456789",
    },
  },
});
