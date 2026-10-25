import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function apkMetadata(badging, certificates) {
  const pkg = badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  const minSdk = Number(badging.match(/^sdkVersion:'(\d+)'/m)?.[1]);
  const architectures = [...(badging.match(/^native-code: (.+)$/m)?.[1] || "").matchAll(/'([^']+)'/g)].map(match => match[1]);
  const certificateSha256 = certificates.match(/^Signer #1 certificate SHA-256 digest: ([a-f\d]{64})\s*$/im)?.[1]?.toLowerCase();
  if (!pkg || pkg[1] !== "asia.zhixian.app") throw new Error("APK package is not asia.zhixian.app");
  if (!Number.isSafeInteger(minSdk) || minSdk < 1 || !architectures.length) throw new Error("APK SDK/architecture metadata is missing");
  if (!certificateSha256 || /^Signer #2 /m.test(certificates)) throw new Error("Expected one verified APK signing certificate");
  return { packageName: pkg[1], versionCode: Number(pkg[2]), version: pkg[3], minSdk, architectures, certificateSha256 };
}

export function finishedAndroidBuild(input) {
  const build = Array.isArray(input) ? input[0] : input;
  if (!build || (Array.isArray(input) && input.length !== 1) || build.platform !== "ANDROID" || build.status !== "FINISHED" || build.buildProfile !== "preview") throw new Error("Expected one finished Android preview build");
  const url = new URL(build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl);
  if (url.protocol !== "https:" || !["expo.dev", "expo.io"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error("Expected an HTTPS Expo build artifact");
  if (!/^[a-f\d-]{36}$/i.test(build.id)) throw new Error("Missing EAS build ID");
  return { id: build.id, artifactUrl: url.href, gitCommit: build.gitCommitHash || null };
}

async function collect() {
  const [buildFile, outputDirectory] = process.argv.slice(2);
  if (!buildFile || !outputDirectory || !process.env.AAPT || !process.env.APKSIGNER) throw new Error("Usage: AAPT=... APKSIGNER=... node scripts/android-preview-artifact.mjs build.json output-directory");
  const build = finishedAndroidBuild(JSON.parse(await fs.readFile(buildFile, "utf8")));
  await fs.mkdir(outputDirectory, { recursive: true });
  const apkPath = path.resolve(outputDirectory, "zhixian-android-preview.apk");
  const response = await fetch(build.artifactUrl, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`APK download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Downloaded artifact is not an APK archive");
  await fs.writeFile(apkPath, bytes);
  const badging = execFileSync(process.env.AAPT, ["dump", "badging", apkPath], { encoding: "utf8" });
  // A nonzero signature verification result stops collection; never infer signing from ZIP contents.
  // Node cannot execFile a Windows batch launcher. Invoke the SDK's same signer
  // JAR directly with Java, keeping file paths as arguments instead of shell text.
  const windowsLauncher = process.platform === "win32" && /\.(bat|cmd)$/i.test(process.env.APKSIGNER);
  const signer = windowsLauncher ? (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java.exe") : "java.exe") : process.env.APKSIGNER;
  const signerArgs = windowsLauncher ? ["-jar", path.join(path.dirname(process.env.APKSIGNER), "lib", "apksigner.jar")] : [];
  const certificates = execFileSync(signer, [...signerArgs, "verify", "--verbose", "--print-certs", apkPath], { encoding: "utf8" });
  const metadata = {
    ...apkMetadata(badging, certificates),
    buildId: build.id, sourceCommit: build.gitCommit,
    fileName: path.basename(apkPath), sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    collectedAt: new Date().toISOString(),
    deviceAcceptance: "pending",
  };
  await fs.writeFile(path.join(outputDirectory, "android-preview.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  await fs.writeFile(path.join(outputDirectory, "SHA256SUMS"), `${metadata.sha256}  ${metadata.fileName}\n`);
  console.log(JSON.stringify(metadata));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) collect().catch(error => { console.error(error.message); process.exitCode = 1; });
