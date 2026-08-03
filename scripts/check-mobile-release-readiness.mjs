import fs from "node:fs";
import path from "node:path";

const mode = process.argv.includes("--submit") ? "submit" : "build";
const root = process.cwd();
const requiredFiles = [
  "mobile-app/app.json",
  "mobile-app/app.config.js",
  "mobile-app/eas.json",
  "mobile-app/assets/icon.png",
  "mobile-app/assets/splash.png",
  "docs/mobile/store-listing.md",
  "app/privacy/page.tsx",
];
const requiredSecrets = mode === "build"
  ? ["EXPO_TOKEN", "EXPO_PUBLIC_EAS_PROJECT_ID", "EXPO_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]
  : ["EXPO_TOKEN", "EXPO_PUBLIC_EAS_PROJECT_ID"];

const failures = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing file: ${file}`);
}
for (const name of requiredSecrets) {
  if (!process.env[name]?.trim()) failures.push(`missing secret: ${name}`);
}

const appPath = path.join(root, "mobile-app/app.json");
if (fs.existsSync(appPath)) {
  const app = JSON.parse(fs.readFileSync(appPath, "utf8")).expo;
  if (app?.ios?.bundleIdentifier !== "asia.zhixian.app") failures.push("iOS bundle identifier must be asia.zhixian.app");
  if (app?.android?.package !== "asia.zhixian.app") failures.push("Android package must be asia.zhixian.app");
  if (!/^0\.4\.0(?:-|$)/.test(app?.version || "")) failures.push("mobile version must be 0.4.0 or a 0.4.0 prerelease");
}

if (failures.length) {
  for (const failure of failures) console.error(`::error title=Mobile release not ready::${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ type: "mobile-release-readiness", mode, ready: true, checkedAt: new Date().toISOString() }));
}
