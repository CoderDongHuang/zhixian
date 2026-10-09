import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getAssetSize, getAssetData } = require("metro/private/Assets");
const root = path.resolve(import.meta.dirname, "..");

test("locked Metro uses the official parser without any image-size dependency", async () => {
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(require("metro/package.json").version, "0.83.8");
  assert.ok(!Object.keys(lock.packages).some((name) => name.endsWith("/node_modules/image-size") || name === "node_modules/image-size"));
  for (const [name, info] of Object.entries(lock.packages)) {
    if (/node_modules\/metro(?:$|-[^/]+$)/.test(name)) assert.equal(info.version, "0.83.8", name);
  }
});

for (const file of [
  "mobile-app/assets/icon.png", "mobile-app/assets/adaptive-icon.png",
  "mobile-app/assets/notification-icon.png", "mobile-app/assets/splash.png",
  "mobile-app/assets/store-feature.png", "public/icon-512.png", "public/icon-192.png",
  "public/favicon.png", "public/brand-logo.png", "public/apple-touch-icon.png",
]) {
  test(`Metro Buffer and file metadata preserve project asset dimensions: ${file}`, async () => {
    const absolute = path.join(root, file);
    const content = await readFile(absolute);
    const expected = { width: content.readUInt32BE(16), height: content.readUInt32BE(20) };
    assert.deepEqual(getAssetSize("png", content, absolute), expected);
    const metadata = await getAssetData(absolute, path.dirname(file), [], "android", "/assets");
    assert.equal(metadata.width, expected.width);
    assert.equal(metadata.height, expected.height);
    assert.ok(metadata.files.includes(absolute));
  });
}

const box = (name, size = 8, payload = Buffer.alloc(0)) => {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(size);
  buffer.write(name, 4, 4, "ascii");
  return Buffer.concat([buffer, payload]);
};
const icns = Buffer.alloc(16);
icns.write("icns"); icns.writeUInt32BE(16, 4); icns.write("icp4", 8);
const heif = Buffer.concat([
  box("ftyp", 16, Buffer.from("avif0000")),
  box("meta", 36, Buffer.concat([Buffer.alloc(4), box("iprp", 24, box("ipco", 16, box("ispe", 0)))])),
]);
const jxl = Buffer.concat([Buffer.from([0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]), box("jxlp", 0)]);
const tiff = Buffer.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 0xff, 0xff]);
const malformed = {
  "zero-length ICNS entry": icns,
  "zero-length HEIF ispe box": heif,
  "zero-length JXL partial box": jxl,
  "zero-length JPEG segment": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]),
  "truncated TIFF entries": tiff,
  "unterminated SVG header": Buffer.from(`<svg width="${"x".repeat(100000)}`),
};

for (const [name, content] of Object.entries(malformed)) {
  test(`Metro rejects ${name} without hanging`, () => {
    // Isolate untrusted parsing so a dependency regression cannot hang the test runner.
    const child = spawnSync(process.execPath, ["-e", `
      const assert = require('node:assert/strict');
      const { readFileSync } = require('node:fs');
      const { getAssetSize } = require('metro/private/Assets');
      assert.throws(() => getAssetSize('png', readFileSync(0), 'malformed.png'));
    `], { cwd: root, input: content, encoding: "utf8", timeout: 5000 });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 0, child.stderr);
  });
}
