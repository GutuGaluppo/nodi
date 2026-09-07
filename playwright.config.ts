import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:1422",
    trace: "on-first-retry",
  },
  webServer: {
    command: "VITE_E2E=true pnpm exec vite --port 1422 --strictPort",
    url: "http://localhost:1422",
    reuseExistingServer: false,
  },
});
