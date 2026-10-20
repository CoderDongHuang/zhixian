export type AndroidRelease = {
  version: string;
  versionCode: number;
  minSdk: number;
  architectures: string[];
  sizeBytes: number;
  sha256: string;
  certificateSha256: string;
  downloadUrl: string;
  notesUrl: string;
  verifiedAt: string;
};

// Withdrawing a release or incomplete evidence always falls back to the web guide.
export function getAndroidRelease(input: unknown): AndroidRelease | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (record.status !== "testing" || record.deviceAcceptance !== "passed" || !record.release || typeof record.release !== "object") return null;
  const release = record.release as Record<string, unknown>;
  if (typeof release.version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.version)) return null;
  if (!["versionCode", "minSdk", "sizeBytes"].every(key => typeof release[key] === "number" && Number.isSafeInteger(release[key]) && (release[key] as number) > 0)) return null;
  if (!Array.isArray(release.architectures) || !release.architectures.length || !release.architectures.every(abi => ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"].includes(abi))) return null;
  if (!["sha256", "certificateSha256"].every(key => typeof release[key] === "string" && /^[a-f\d]{64}$/.test(release[key] as string))) return null;
  if (typeof release.verifiedAt !== "string" || !Number.isFinite(Date.parse(release.verifiedAt))) return null;
  if (typeof release.downloadUrl !== "string" || !/^https:\/\/github\.com\/CoderDongHuang\/zhixian\/releases\/download\/[\w.-]+\/zhixian-android-preview\.apk$/.test(release.downloadUrl)) return null;
  if (typeof release.notesUrl !== "string" || !/^https:\/\/github\.com\/CoderDongHuang\/zhixian\/releases\/tag\/[\w.-]+$/.test(release.notesUrl)) return null;
  const tag = release.downloadUrl.split("/").at(-2);
  if (release.notesUrl.split("/").at(-1) !== tag) return null;
  return release as AndroidRelease;
}
