import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const platform = process.argv[2];
if (!["android", "ios"].includes(platform)) throw new Error("Choose android or ios.");
const required = platform === "android"
  ? ["JAVA_HOME", "ANDROID_HOME", "CODE3_ANDROID_KEYSTORE", "CODE3_ANDROID_STORE_PASSWORD", "CODE3_ANDROID_KEY_ALIAS", "CODE3_ANDROID_KEY_PASSWORD", "CODE3_BUILD_NUMBER"]
  : ["CODE3_APPLE_TEAM_ID", "CODE3_IOS_PROFILE_NAME", "CODE3_BUILD_NUMBER"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}. Signing values belong in the local environment, never in source control.`);
if (!/^[1-9][0-9]{0,8}$/.test(process.env.CODE3_BUILD_NUMBER)) throw new Error("Use a new positive build number.");
if (platform === "ios" && process.platform !== "darwin") throw new Error("iOS archive signing requires macOS with Xcode 26 or newer.");
if (platform === "android" && !existsSync(process.env.CODE3_ANDROID_KEYSTORE)) throw new Error("The owner's Android upload keystore was not found.");
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) throw new Error("Native release step failed. No upload was attempted.");
}
run(process.execPath, ["scripts/native-build.mjs"]);
run(process.execPath, ["node_modules/@capacitor/cli/bin/capacitor", "sync", platform]);
if (platform === "android") {
  if (process.platform === "win32") run("cmd.exe", ["/d", "/c", "gradlew.bat", "bundleRelease"], resolve("android"));
  else run("./gradlew", ["bundleRelease"], resolve("android"));
  console.log("Signed Android bundle: android/app/build/outputs/bundle/release/app-release.aab. Not uploaded.");
} else {
  const team = process.env.CODE3_APPLE_TEAM_ID;
  const profile = process.env.CODE3_IOS_PROFILE_NAME;
  if (!/^[A-Z0-9]{10}$/.test(team) || !/^[a-zA-Z0-9 _.-]{1,128}$/.test(profile)) throw new Error("Invalid team or provisioning profile identifier.");
  mkdirSync("artifacts/native/ios", { recursive: true });
  const archive = resolve("artifacts/native/ios/Code3TCG.xcarchive");
  const options = resolve("artifacts/native/ios/ExportOptions.plist");
  writeFileSync(options, `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>method</key><string>app-store-connect</string><key>teamID</key><string>${team}</string><key>signingStyle</key><string>manual</string><key>provisioningProfiles</key><dict><key>app.code3tcg.mobile</key><string>${profile}</string></dict></dict></plist>`);
  run("xcodebuild", ["-project", "ios/App/App.xcodeproj", "-scheme", "App", "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", archive, `DEVELOPMENT_TEAM=${team}`, "CODE_SIGN_STYLE=Manual", `PROVISIONING_PROFILE_SPECIFIER=${profile}`, "CODE_SIGN_IDENTITY=Apple Distribution", `CURRENT_PROJECT_VERSION=${process.env.CODE3_BUILD_NUMBER}`, "archive"]);
  run("xcodebuild", ["-exportArchive", "-archivePath", archive, "-exportPath", resolve("artifacts/native/ios/export"), "-exportOptionsPlist", options]);
  console.log("Signed iOS export: artifacts/native/ios/export. Not uploaded.");
}
