// Check names only. Never print, decode, or write signing material here.
const required = [
  "CODE3_ANDROID_KEYSTORE_BASE64",
  "CODE3_ANDROID_STORE_PASSWORD",
  "CODE3_ANDROID_KEY_ALIAS",
  "CODE3_ANDROID_KEY_PASSWORD",
];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Android signing is not configured. Add these repository secrets: ${missing.join(", ")}. No package was built or uploaded.`);
  process.exitCode = 1;
} else {
  console.log("Android signing settings are present. The release build will validate the keystore and passwords.");
}
