import assert from "node:assert/strict";
import test from "node:test";
import { apkMetadata, finishedAndroidBuild } from "../scripts/android-preview-artifact.mjs";
const badging = "package: name='asia.zhixian.app' versionCode='2' versionName='0.4.0'\nsdkVersion:'24'\nnative-code: 'arm64-v8a' 'armeabi-v7a'\n";
const cert = `Signer #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`;
test("APK receipt extracts actual version, SDK, ABIs and signing certificate", () => {
  assert.deepEqual(apkMetadata(badging, cert), { packageName: "asia.zhixian.app", versionCode: 2, version: "0.4.0", minSdk: 24, architectures: ["arm64-v8a", "armeabi-v7a"], certificateSha256: "ab".repeat(32) });
});
test("APK receipt rejects wrong package and missing native/signature evidence", () => {
  assert.throws(() => apkMetadata(badging.replace("asia.zhixian.app", "other.app"), cert));
  assert.throws(() => apkMetadata(badging.split("native-code:")[0], cert));
  assert.throws(() => apkMetadata(badging, ""));
  assert.throws(() => apkMetadata(badging, cert + "Signer #2 certificate SHA-256 digest: bad"));
});
test("unfinished, non-preview, iOS and untrusted download URLs cannot become APK receipts", () => {
  const build = { id: "0ae3ae8d-fb19-449a-a1f3-71d5e1169674", platform: "ANDROID", status: "FINISHED", buildProfile: "preview", artifacts: { buildUrl: "https://artifacts.eascdn.net/fake.apk" } };
  assert.throws(() => finishedAndroidBuild(build));
  build.artifacts.buildUrl = "https://expo.dev/artifacts/eas/test.apk";
  assert.equal(finishedAndroidBuild([build]).id, build.id);
  for (const change of [{ status: "ERRORED" }, { buildProfile: "production" }, { platform: "IOS" }]) assert.throws(() => finishedAndroidBuild({ ...build, ...change }));
  assert.throws(() => finishedAndroidBuild([build, build]));
  assert.throws(() => finishedAndroidBuild({ ...build, artifacts: { buildUrl: "https://expo.dev.evil.invalid/test.apk" } }));
});
