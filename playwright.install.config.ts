import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
const port = Number(process.env.E2E_PORT || 3100);

// Public install/settings checks need no database or application credentials.
// Keep the normal configuration for the full authenticated integration suite.
export default defineConfig({
  ...config,
  testMatch: "install.spec.ts",
  outputDir: "./test-results/install-public",
  webServer: {
    ...server,
    command: server!.command,
    url: `http://127.0.0.1:${port}/install`,
    env: {
      ...server?.env,
      DATABASE_URL: "postgresql://test:test@127.0.0.1:9/zhixian_install_test?connect_timeout=1",
      DIRECT_URL: "postgresql://test:test@127.0.0.1:9/zhixian_install_test?connect_timeout=1",
      AUTH_SECRET: "e2e-auth-secret-at-least-24-characters",
    },
  },
});
