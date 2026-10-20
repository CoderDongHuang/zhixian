import assert from "node:assert/strict";
import test from "node:test";
import { getAndroidRelease } from "../lib/android-release.ts";

const release = {
  version: "0.4.0", versionCode: 2, minSdk: 24, architectures: ["arm64-v8a"], sizeBytes: 1024,
  sha256: "ab".repeat(32), certificateSha256: "cd".repeat(32), verifiedAt: "2026-10-20T00:00:00Z",
  downloadUrl: "https://github.com/CoderDongHuang/zhixian/releases/download/android-test-2/zhixian-android-preview.apk",
  notesUrl: "https://github.com/CoderDongHuang/zhixian/releases/tag/android-test-2",
};
test("only a device-accepted testing release exposes the immutable APK download", () => {
  assert.deepEqual(getAndroidRelease({ status: "testing", deviceAcceptance: "passed", release }), release);
  for (const input of [null, {}, { status: "pending", release }, { status: "withdrawn", deviceAcceptance: "passed", release }, { status: "testing", deviceAcceptance: "pending", release }]) assert.equal(getAndroidRelease(input), null);
});
test("incomplete receipts, mismatching tags and arbitrary links never expose a download", () => {
  for (const change of [{ sizeBytes: 0 }, { versionCode: NaN }, { sha256: "bad" }, { certificateSha256: "" }, { architectures: [] }, { verifiedAt: "invalid" }, { downloadUrl: "https://example.com/test.apk" }, { notesUrl: release.notesUrl + "-other" }]) {
    assert.equal(getAndroidRelease({ status: "testing", deviceAcceptance: "passed", release: { ...release, ...change } }), null);
  }
});
