// Phone push stays off unless the build has Firebase (VITE_PUSH_ENABLED=true) and runs natively.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enableNativePush, nativePushAvailable } from "../src/native/pushNotifications.js";

assert.equal(nativePushAvailable({ native: false, flag: "true" }), false);
assert.equal(nativePushAvailable({ native: true, flag: "" }), false);
assert.equal(nativePushAvailable({ native: true, flag: "true" }), true);
const off = await enableNativePush({});
assert.equal(off.ok, false, "web / no-Firebase builds never call the native register()");

const workflow = readFileSync(new URL("../.github/workflows/android-release.yml", import.meta.url), "utf8");
assert.match(workflow, /VITE_PUSH_ENABLED: \$\{\{ secrets\.GOOGLE_SERVICES_JSON_BASE64 != ''/);
const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
console.log("native push gating: ok");
