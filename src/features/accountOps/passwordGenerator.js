import { ACCOUNT_OPS_LIMITS } from "./constants.js";
import { secureRandomIndex } from "./secureRandom.js";

const CLASSES = Object.freeze({
  uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lowercase: "abcdefghijkmnopqrstuvwxyz",
  numbers: "23456789",
  symbols: "!@#$%^&*_-+=",
});

function shuffle(values, randomSource) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1, randomSource);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/** Returns an ephemeral password string. Callers must never add it to persisted records. */
export function generateStrongPassword(options = {}) {
  const length = Number(options.length ?? 20);
  if (!Number.isInteger(length) || length < ACCOUNT_OPS_LIMITS.minimumPasswordLength || length > ACCOUNT_OPS_LIMITS.maximumPasswordLength) {
    throw new RangeError(`Password length must be ${ACCOUNT_OPS_LIMITS.minimumPasswordLength}-${ACCOUNT_OPS_LIMITS.maximumPasswordLength}.`);
  }
  const requested = ["uppercase", "lowercase", "numbers", "symbols"].filter((name) => options[name] !== false);
  if (requested.length < 3) throw new RangeError("At least three password character classes are required.");
  const alphabet = requested.map((name) => CLASSES[name]).join("");
  const characters = requested.map((name) => CLASSES[name][secureRandomIndex(CLASSES[name].length, options.randomSource)]);
  while (characters.length < length) characters.push(alphabet[secureRandomIndex(alphabet.length, options.randomSource)]);
  return shuffle(characters, options.randomSource).join("");
}

export function passwordMeetsPolicy(value, options = {}) {
  const password = String(value || "");
  const minimumLength = Number(options.minimumLength ?? ACCOUNT_OPS_LIMITS.minimumPasswordLength);
  return password.length >= minimumLength
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && (options.symbolsRequired === false || /[^A-Za-z0-9]/.test(password));
}
