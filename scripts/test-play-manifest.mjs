import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkPlayManifest, PLAY_APPLICATION_ID } from "./check-play-manifest.mjs";

const xml = `<manifest package="com.code3tcg.app" android:versionCode="9" android:versionName="1.0.0">
<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/>
<application android:allowBackup="false" android:usesCleartextTraffic="false">
<activity android:name="app.code3tcg.mobile.MainActivity" android:exported="true"><intent-filter><category android:name="android.intent.category.LAUNCHER"/></intent-filter><intent-filter><data android:host="auth" android:path="/callback" android:scheme="code3tcg"/></intent-filter></activity>
<provider android:authorities="com.code3tcg.app.fileprovider" android:exported="false" android:name="androidx.core.content.FileProvider"></provider>
</application></manifest>`;

test("compiled Play identity accepts the existing Java namespace and auth callback", () => {
  assert.deepEqual(checkPlayManifest(xml), { package: PLAY_APPLICATION_ID, buildNumber: 9, versionName: "1.0.0", launcher: "app.code3tcg.mobile.MainActivity", targetSdk: 36 });
});
test("wrong package, old builds and unresolved launcher classes block distribution", () => {
  for (const [from, to] of [['package="com.code3tcg.app"', 'package="app.code3tcg.mobile"'], ['versionCode="9"', 'versionCode="8"'], ['app.code3tcg.mobile.MainActivity', 'com.code3tcg.app.MainActivity'], ['targetSdkVersion="36"', 'targetSdkVersion="35"'], ['android:targetSdkVersion="36"', '']]) assert.throws(() => checkPlayManifest(xml.replace(from, to)));
});
test("public file providers, cleartext traffic, backup and broken sign-in links block distribution", () => {
  for (const [from, to] of [['com.code3tcg.app.fileprovider', 'app.code3tcg.mobile.fileprovider'], ['android:allowBackup="false"', 'android:allowBackup="true"'], ['android:usesCleartextTraffic="false"', 'android:usesCleartextTraffic="true"'], ['android:scheme="code3tcg"', 'android:scheme="wrong"'], ['android:path="/callback"', 'android:path="/wrong"']]) assert.throws(() => checkPlayManifest(xml.replace(from, to)));
});
test("Android Play package changes preserve iOS and shared Capacitor identity", () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("android/app/build.gradle"), /applicationId "com\.code3tcg\.app"/);
  assert.match(read("android/app/build.gradle"), /namespace = "app\.code3tcg\.mobile"/);
  assert.match(read("android/app/src/main/java/app/code3tcg/mobile/MainActivity.java"), /package app\.code3tcg\.mobile;/);
  assert.equal(JSON.parse(read("capacitor.config.json")).appId, "app.code3tcg.mobile");
  assert.match(read("ios/App/App.xcodeproj/project.pbxproj"), /PRODUCT_BUNDLE_IDENTIFIER = app\.code3tcg\.mobile;/);
});
