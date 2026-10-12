import { defineConfig, devices } from "@playwright/test";
import { createECDH } from "node:crypto";

const port = Number(process.env.E2E_PORT || 3100);
const browserChannel = process.env.E2E_BROWSER_CHANNEL || undefined;
const headless = process.env.E2E_HEADFUL === "true" ? false : undefined;
// A real P-256 public point is required by Edge's PushManager. Never use a
// production key pair or a short placeholder in the isolated test server.
const testVapidPublicKey = createECDH("prime256v1").generateKeys().toString("base64url");
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: browserChannel,
    headless,
    launchOptions: browserChannel ? { ignoreDefaultArgs: ["--disable-background-networking"] } : undefined,
  },
  projects: [{ name: browserChannel ? `desktop-${browserChannel}` : "chromium", use: { ...devices["Desktop Chrome"] } }, { name: browserChannel ? `mobile-${browserChannel}` : "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    // A previously started server may have real credentials or a different DB.
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, APP_URL: `http://127.0.0.1:${port}`, E2E_TEST_MODE: "true", E2E_TEST_SECRET: process.env.E2E_TEST_SECRET || "e2e-local-secret", VAPID_PUBLIC_KEY: testVapidPublicKey, ADMIN_EMAILS: "e2e-admin@example.com", WECHAT_APP_ID: process.env.WECHAT_APP_ID || "wx-e2e", WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET || "e2e-secret", AI_API_KEY: "", AI_API_URL: "", AI_MODEL: "", ANALYSIS_AI_API_KEY: "", ANALYSIS_AI_API_URL: "", ANALYSIS_AI_MODEL: "", LEARNING_AI_API_KEY: "", LEARNING_AI_API_URL: "", LEARNING_AI_MODEL: "", RESEARCH_AI_API_KEY: "", RESEARCH_AI_API_URL: "", RESEARCH_AI_MODEL: "", EMBEDDING_API_KEY: "local-mock-only", EMBEDDING_API_URL: "http://127.0.0.1:3158", EMBEDDING_MODEL: "e2e-search", EMBEDDING_DIMENSIONS: "1024" },
  },
});
