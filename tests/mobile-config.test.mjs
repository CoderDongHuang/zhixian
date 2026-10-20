import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const configure = require("../mobile-app/app.config.js");
const config = require("../mobile-app/app.json").expo;
test("Firebase file configuration preserves package identity and supports EAS file variables", () => {
  const previous = process.env.GOOGLE_SERVICES_JSON;
  try {
    delete process.env.GOOGLE_SERVICES_JSON;
    assert.equal(configure({ config }).android.googleServicesFile, undefined);
    const local = { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } };
    assert.equal(configure({ config: local }).android.googleServicesFile, "./google-services.json");
    process.env.GOOGLE_SERVICES_JSON = "/private/eas/google-services.json";
    const result = configure({ config: local });
    assert.equal(result.android.googleServicesFile, process.env.GOOGLE_SERVICES_JSON);
    assert.equal(result.android.package, "asia.zhixian.app");
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = previous;
  }
});
test("build and OTA use the linked EAS project without a local public environment variable", () => {
  const previous = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  try {
    const result = configure({ config });
    assert.equal(result.updates.url, `https://u.expo.dev/${config.extra.eas.projectId}`);
    assert.equal(result.extra.eas.projectId, config.extra.eas.projectId);
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    else process.env.EXPO_PUBLIC_EAS_PROJECT_ID = previous;
  }
});
