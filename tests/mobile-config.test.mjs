import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const configure = require("../mobile-app/app.config.js");
const config = require("../mobile-app/app.json").expo;
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
