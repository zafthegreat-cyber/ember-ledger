import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PLAY_APPLICATION_ID = "com.code3tcg.app";
const MAIN_ACTIVITY = "app.code3tcg.mobile.MainActivity";
const attributes = text => Object.fromEntries([...text.matchAll(/([\w:.-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));

// Inspect the compiled bundletool manifest, not just the source Gradle setting.
// Namespace and application ID intentionally differ; the launcher class must resolve.
export function checkPlayManifest(xml, { minimumBuild = 9 } = {}) {
  const manifest = attributes(xml.match(/<manifest\b([^>]*)>/)?.[1] || "");
  if (manifest.package !== PLAY_APPLICATION_ID) throw new Error(`Play requires package ${PLAY_APPLICATION_ID}.`);
  const version = manifest["android:versionCode"];
  if (!/^[1-9]\d*$/.test(version || "") || Number(version) < minimumBuild) throw new Error(`Play build must be at least ${minimumBuild}.`);
  const sdk = attributes(xml.match(/<uses-sdk\b([^>]*)\/>/)?.[1] || "");
  const targetSdk = Number(sdk["android:targetSdkVersion"]);
  if (!Number.isInteger(targetSdk) || targetSdk < 36) throw new Error("Android target SDK must be at least 36.");
  const app = attributes(xml.match(/<application\b([^>]*)>/)?.[1] || "");
  if (app["android:allowBackup"] !== "false" || app["android:usesCleartextTraffic"] !== "false" || app["android:debuggable"] === "true") throw new Error("Private data and HTTPS settings must remain restricted.");
  const launchers = [...xml.matchAll(/<activity\b([^>]*)>([\s\S]*?)<\/activity>/g)].filter(([, , body]) => body.includes('android:name="android.intent.category.LAUNCHER"'));
  if (launchers.length !== 1) throw new Error("Expected exactly one launcher activity.");
  const launcher = attributes(launchers[0][1]);
  if (launcher["android:name"] !== MAIN_ACTIVITY || launcher["android:exported"] !== "true") throw new Error("Launcher must resolve to the existing Java activity.");
  if (!/<data\b[^>]*android:scheme="code3tcg"[^>]*\/>/.test(launchers[0][2]) || !launchers[0][2].includes('android:host="auth"') || !launchers[0][2].includes('android:path="/callback"')) throw new Error("Existing authentication callback is missing.");
  const provider = [...xml.matchAll(/<provider\b([^>]*)>/g)].map(([, text]) => attributes(text)).find(row => row["android:name"] === "androidx.core.content.FileProvider");
  if (provider?.["android:authorities"] !== `${PLAY_APPLICATION_ID}.fileprovider` || provider["android:exported"] !== "false") throw new Error("File sharing must use the Play package's private provider.");
  return { package: manifest.package, buildNumber: Number(version), versionName: manifest["android:versionName"], launcher: MAIN_ACTIVITY, targetSdk: Number(sdk["android:targetSdkVersion"]) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Pass the bundletool dump manifest XML path.");
  console.log(JSON.stringify(checkPlayManifest(readFileSync(resolve(process.argv[2]), "utf8")), null, 2));
}
