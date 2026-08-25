import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3100);
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, { name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, E2E_TEST_MODE: "true", E2E_TEST_SECRET: process.env.E2E_TEST_SECRET || "e2e-local-secret", ADMIN_EMAILS: "e2e-admin@example.com", WECHAT_APP_ID: process.env.WECHAT_APP_ID || "wx-e2e", WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET || "e2e-secret", AI_API_KEY: "", AI_API_URL: "", AI_MODEL: "", ANALYSIS_AI_API_KEY: "", ANALYSIS_AI_API_URL: "", ANALYSIS_AI_MODEL: "", LEARNING_AI_API_KEY: "", LEARNING_AI_API_URL: "", LEARNING_AI_MODEL: "" },
  },
});
