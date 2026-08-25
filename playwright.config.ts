import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 20_000,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://darabiha.com", screenshot: "only-on-failure" },
  reporter: "line",
});
