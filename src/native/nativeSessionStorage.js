import { registerPlugin } from "@capacitor/core";

// Native implementations use Android Keystore + AES-GCM and iOS Keychain.
// Fail closed if the plugin is missing; never fall back to plaintext storage.
const SecureSession = registerPlugin("SecureSession");
export const nativeSessionStorage = {
  async getItem(key) { const result = await SecureSession.get({ key }); return result.value ?? null; },
  async setItem(key, value) { await SecureSession.set({ key, value }); },
  async removeItem(key) { await SecureSession.remove({ key }); },
};
