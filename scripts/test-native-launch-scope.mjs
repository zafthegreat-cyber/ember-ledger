// Store audit 2026-11-14: what the Android/iOS apps leave out, how phone push
// registers, and that the server minor flag is wired. Mocked plugin, no device.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isHiddenInNativeApp, nativeAllowsRemoteProductImage } from "../src/config/nativeLaunchScope.js";
import { plainLanguageText, removeBetaWording } from "../src/config/plainLanguage.js";
import { enableNativePush, listenForPushOpens, nativePushAvailable, nativePushSupport } from "../src/native/pushNotifications.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("unfinished screens are hidden only in the phone apps", () => {
  for (const tab of ["tidepool", "parentCenter", "kidsProgram", "comingSoon", "knownLimitations", "sponsor"]) {
    assert.equal(isHiddenInNativeApp(tab, true), true, tab);
    assert.equal(isHiddenInNativeApp(tab, false), false, tab);
  }
  assert.equal(isHiddenInNativeApp("vault", true), false);
  const app = read("src/App.jsx");
  assert.match(app, /const showCommunityExperience = !NATIVE_BUILD && \(/);
  assert.match(app, /const showFamilyExperience = !NATIVE_BUILD && \(/);
  assert.match(app, /if \(nativeHiddenTab\) setActiveTab\("dashboard"\);/);
});

test("phone apps show only their own images and members' uploads", () => {
  for (const url of ["https://tcgplayer-cdn.tcgplayer.com/product/635011_200w.jpg", "https://images.pokemontcg.io/sv1/1.png", "http://example.com/a.png"]) {
    assert.equal(nativeAllowsRemoteProductImage(url, true), false, url);
    assert.equal(nativeAllowsRemoteProductImage(url, false), true, url);
  }
  for (const url of ["https://gxsfququorfczvhrkudl.supabase.co/storage/v1/object/sign/x.jpg", "/assets/placeholder.png", "data:image/png;base64,AA", "blob:https://localhost/1", "https://code3tcg.app/icon.png"]) {
    assert.equal(nativeAllowsRemoteProductImage(url, true), true, url);
  }
});

test("phone apps drop 'beta' from visible text; the website keeps it", () => {
  const cases = [
    ["Free during beta", "Free"],
    ["Thank you - your beta feedback helps shape Code 3 TCG.", "Thank you - your feedback helps shape Code 3 TCG."],
    ["Everything stays local in this beta build.", "Everything stays local in this build."],
    ["Thanks for joining the private beta!", "Thanks for joining the app!"],
    ["Beta access: on", "Access: on"],
    ["Beta", "New"],
    ["Limited Edition Beta Black Lotus", "Limited Edition Beta Black Lotus"],
    ["Alphabet soup", "Alphabet soup"],
  ];
  for (const [input, expected] of cases) assert.equal(removeBetaWording(input), expected, input);
  assert.equal(plainLanguageText("Free during beta", { native: false }), "Free during beta");
  assert.equal(plainLanguageText("Free during beta", { native: true }), "Free");
});

function fakePlugin({ permission = "prompt", answer = "granted", token = "a".repeat(64), fail = false } = {}) {
  const listeners = {};
  const calls = { requested: 0, channels: [], registered: 0 };
  return {
    calls,
    listeners,
    load: async () => ({
      checkPermissions: async () => ({ receive: permission }),
      requestPermissions: async () => { calls.requested += 1; return { receive: answer }; },
      createChannel: async (channel) => { calls.channels.push(channel.id); },
      addListener: (name, fn) => { listeners[name] = fn; return Promise.resolve({ remove: async () => { delete listeners[name]; } }); },
      register: async () => {
        calls.registered += 1;
        queueMicrotask(() => (fail ? listeners.registrationError?.({ error: "no" }) : listeners.registration?.({ value: token })));
      },
    }),
  };
}
const fakeClient = (error = null) => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push([name, args]); return { error }; } };
};

test("Android without Firebase never registers (it would crash)", async () => {
  assert.equal(nativePushAvailable("android", false), false);
  assert.equal(nativePushAvailable("android", true), true);
  assert.equal(nativePushAvailable("ios", false), true);
  assert.equal(nativePushAvailable("", true), false);
  const plugin = fakePlugin();
  const result = await enableNativePush({ client: fakeClient(), load: plugin.load, platform: "android", available: false });
  assert.equal(result.permission, "unavailable");
  assert.equal(plugin.calls.registered, 0);
});

test("turning alerts on asks permission, registers and saves the token", async () => {
  const plugin = fakePlugin();
  const client = fakeClient();
  const result = await enableNativePush({ client, appVersion: "1.0.0", load: plugin.load, platform: "android", available: true });
  assert.equal(result.permission, "granted");
  assert.equal(result.registration, "registered");
  assert.equal(plugin.calls.requested, 1);
  assert.deepEqual(plugin.calls.channels, ["restocks"]);
  assert.deepEqual(client.calls, [["register_push_token", { p_token: "a".repeat(64), p_platform: "android", p_app_version: "1.0.0" }]]);
});

test("a declined prompt, a failed registration or a failed save is reported, not hidden", async () => {
  assert.equal((await enableNativePush({ client: fakeClient(), load: fakePlugin({ answer: "denied" }).load, platform: "ios", available: true })).permission, "denied");
  assert.equal((await enableNativePush({ client: fakeClient(), load: fakePlugin({ fail: true }).load, platform: "ios", available: true })).registration, "failed");
  assert.equal((await enableNativePush({ client: fakeClient({ message: "x" }), load: fakePlugin().load, platform: "ios", available: true })).registration, "failed");
  assert.equal((await nativePushSupport({ load: fakePlugin({ permission: "granted" }).load, available: true })).permission, "granted");
});

test("tapping a notification opens only an in-app path", async () => {
  const plugin = fakePlugin();
  const opened = [];
  await listenForPushOpens((path) => opened.push(path), { load: plugin.load, available: true });
  plugin.listeners.pushNotificationActionPerformed({ notification: { data: { url: "/find/restocks" } } });
  plugin.listeners.pushNotificationActionPerformed({ notification: { data: { url: "https://evil.example" } } });
  plugin.listeners.pushNotificationActionPerformed({ notification: { data: {} } });
  assert.deepEqual(opened, ["/find/restocks"]);
});

test("native projects, server and kid safety are wired", () => {
  assert.match(read("ios/App/App/AppDelegate.swift"), /capacitorDidRegisterForRemoteNotifications/);
  assert.match(read("ios/App/App/App.entitlements"), /<key>aps-environment<\/key>/);
  assert.equal((read("ios/App/App.xcodeproj/project.pbxproj").match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2);
  assert.match(read("android/app/src/main/AndroidManifest.xml"), /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(read("scripts/native-build.mjs"), /VITE_ANDROID_PUSH_CONFIGURED/);
  const sendPush = read("supabase/functions/send-push/index.ts");
  assert.match(sendPush, /api\.push\.apple\.com/);
  assert.match(sendPush, /replace\(\/\\s\+\/g, ""\)/, "APNs key whitespace is stripped");
  const app = read("src/App.jsx");
  assert.match(app, /supabase\.rpc\("mark_my_account_minor"\)/);
  assert.match(read("src/lib/userProfile.js"), /isMinor: row\.is_minor === true/);
});
