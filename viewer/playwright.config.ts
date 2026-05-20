import { defineConfig, devices } from "@playwright/test";

const PROD_PORT = 4321;
const DEV_PORT = 4322;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  projects: [
    {
      name: "prod",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PROD_PORT}`,
      },
    },
    {
      name: "dev",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${DEV_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite preview --port ${PROD_PORT} --strictPort`,
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `pnpm exec vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  use: {
    trace: "retain-on-failure",
  },
});
