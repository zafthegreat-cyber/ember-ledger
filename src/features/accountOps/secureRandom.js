import { AccountOpsSecurityError } from "./security.js";

function requireRandomSource(randomSource = globalThis.crypto) {
  if (!randomSource || typeof randomSource.getRandomValues !== "function") {
    throw new AccountOpsSecurityError("SECURE_RANDOM_UNAVAILABLE", "A Web Crypto compatible secure random source is required.");
  }
  return randomSource;
}

export function secureRandomIndex(maximum, randomSource = globalThis.crypto) {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 256) throw new RangeError("maximum must be an integer from 1 through 256.");
  const source = requireRandomSource(randomSource);
  const ceiling = 256 - (256 % maximum);
  const byte = new Uint8Array(1);
  for (let attempts = 0; attempts < 1_024; attempts += 1) {
    source.getRandomValues(byte);
    if (byte[0] < ceiling) return byte[0] % maximum;
  }
  throw new AccountOpsSecurityError("SECURE_RANDOM_FAILED", "The secure random source did not produce an unbiased value.");
}

export function secureRandomString(length, alphabet, randomSource = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1 || length > 512) throw new RangeError("length is outside the supported range.");
  const symbols = [...String(alphabet || "")];
  if (symbols.length < 2 || symbols.length > 256) throw new RangeError("alphabet must contain between 2 and 256 symbols.");
  let result = "";
  for (let index = 0; index < length; index += 1) result += symbols[secureRandomIndex(symbols.length, randomSource)];
  return result;
}

export function secureUuid(randomSource = globalThis.crypto) {
  const source = requireRandomSource(randomSource);
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
