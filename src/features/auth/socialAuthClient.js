import { supabase, createSocialOAuthClient, clearSocialOAuthStorage } from "../../supabaseClient.js";
import { isNativePlatform } from "../../native/nativeRuntime.js";
import { nativeSessionStorage } from "../../native/nativeSessionStorage.js";
import { createSocialAuthService, loadSocialAvailability, releasedProviders } from "./socialAuth.mjs";

const env = import.meta.env || {};
const native = isNativePlatform();
export const accountLinkingEnabled = env.VITE_AUTH_ACCOUNT_LINKING_VERIFIED === "true";
export const availableSocialProviders = signal => loadSocialAvailability({
  projectUrl: env.VITE_SUPABASE_URL, publicKey: env.VITE_SUPABASE_ANON_KEY,
  released: releasedProviders(env.VITE_AUTH_VERIFIED_PROVIDERS), signal,
});
const intentStorage = native ? nativeSessionStorage : {
  getItem: key => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: key => sessionStorage.removeItem(key),
};
export const socialAuth = createSocialAuthService({
  client: supabase, oauthClient: createSocialOAuthClient(), clearOAuthStorage: clearSocialOAuthStorage,
  projectUrl: env.VITE_SUPABASE_URL, store: intentStorage,
  loadAvailability: availableSocialProviders, native, linkingEnabled: accountLinkingEnabled,
  origin: globalThis.location?.origin, development: env.DEV === true,
  launch: async url => {
    if (native) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    } else { globalThis.location.assign(url); }
  },
});

export async function finishNativeSocialCallback(callback) {
  try { return await socialAuth.finish(callback); }
  finally {
    // The Android browser returns through the OS; close is supported on iOS.
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => {});
  }
}
