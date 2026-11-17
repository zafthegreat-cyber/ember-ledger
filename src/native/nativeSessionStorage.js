import { registerPlugin } from "@capacitor/core";

// Native implementations use Android Keystore + AES-GCM and iOS Keychain.
// Fail closed if the plugin is missing; never fall back to plaintext storage.
const SecureSession = registerPlugin("SecureSession");

// Write-through memory copy. The auth SDK reads the session on every
// getUser()/getSession() call (several times a minute); each read through the
// native bridge decrypts with the Keystore and can stall after the phone wakes,
// which showed up as "Account verification did not finish in time". Only this
// app writes these keys, so the copy stays exact; the secure store remains the
// source of truth on the next app start.
const memory = new Map();
export const nativeSessionStorage = {
  async getItem(key) {
    if (memory.has(key)) return memory.get(key);
    const result = await SecureSession.get({ key });
    const value = result.value ?? null;
    memory.set(key, value);
    return value;
  },
  async setItem(key, value) { await SecureSession.set({ key, value }); memory.set(key, value); },
  async removeItem(key) { await SecureSession.remove({ key }); memory.set(key, null); },
};
