import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 20_000,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://darabiha.com", ...devices["Desktop Chrome"], screenshot: "only-on-failure" },
  reporter: "line",
});
