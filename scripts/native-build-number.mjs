import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Builds 1–6 already existed. A store operator must still choose a number
// greater than the last accepted upload; this floor cannot inspect a console.
export const MINIMUM_NATIVE_BUILD_NUMBER = 7;

export function resolveNativeBuildNumber(value, { required = false } = {}) {
  if (value === undefined || value === "") {
    if (required) throw new Error("Set CODE3_BUILD_NUMBER to a new build number, at least 7.");
    return MINIMUM_NATIVE_BUILD_NUMBER;
  }
  const text = String(value);
  if (!/^[1-9][0-9]{0,8}$/.test(text) || Number(text) < MINIMUM_NATIVE_BUILD_NUMBER) {
    throw new Error("CODE3_BUILD_NUMBER must be a whole number from 7 through 999999999, above the last distributed/uploaded build.");
  }
  return Number(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Native build number ${resolveNativeBuildNumber(process.env.CODE3_BUILD_NUMBER)} validated. Verify it exceeds the last accepted upload before signing.`);
}
