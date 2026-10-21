import { canonicalStringify } from "../backup/canonicalJson.js";
import { sha256Text } from "./identityHash.js";
import { redactEbayPersonalData } from "./privacyPolicy.js";

const SEALED = new Set(["code3-device-workspace-archive", "code3-session-draft-archive", "code3-workspace-conflict-copy", "code3-workspace-recovery"]);
const JSON_FIELDS = new Set(["beforeRaw", "afterRaw", "prepared", "committed"]);
/** Privacy edits create a new sealed safety version; old hashes never certify new bytes. */
export function redactEbayArchive(value, policy, references = new Map(), rawHashes = new Map()) {
  function walk(current, field = "", depth = 0) {
    if (depth > 60) throw new Error("The eBay privacy safety copy is nested too deeply.");
    if (typeof current === "string" && (JSON_FIELDS.has(field) || field === "raw-source")) {
      try {
        const parsed = JSON.parse(current);
        const redacted = redactEbayArchive(parsed,policy,references,rawHashes);
        if (redacted === parsed) return current;
        const raw = canonicalStringify(redacted);
        rawHashes.set(sha256Text(canonicalStringify(current)),sha256Text(canonicalStringify(raw)));
        return raw;
      } catch (error) {
        if (error instanceof SyntaxError) return current;
        throw error;
      }
    }
    if (!current || typeof current !== "object") return current;
    const safe = redactEbayPersonalData(current,policy);
    if (Array.isArray(safe)) {
      const next = safe.map((entry) => walk(entry,field,depth+1));
      return safe !== current || next.some((entry,index) => entry !== current[index]) ? next : current;
    }
    let changed = safe !== current;
    const next = {};
    for (const [key,entry] of Object.entries(safe)) {
      let result;
      if ((key === "raws" || ["before","next"].includes(key) && Object.hasOwn(current,"beforeMarker") && Object.hasOwn(current,"status")) && entry && typeof entry === "object") {
        result = Object.fromEntries(Object.entries(entry).map(([source,raw]) => [source,walk(raw,"raw-source",depth+1)]));
        if (Object.keys(result).every((source) => result[source] === entry[source])) result = entry;
      } else result = walk(entry,key,depth+1);
      if (["beforeRawHash","afterRawHash"].includes(key) && rawHashes.has(result)) result = rawHashes.get(result);
      changed ||= result !== entry; next[key] = result;
    }
    if (typeof next.payloadKey === "string" && references.has(next.payloadKey)) {
      let replacement = references.get(next.payloadKey);
      const visited = new Set([next.payloadKey]);
      while (references.has(replacement.key) && !visited.has(replacement.key)) { visited.add(replacement.key); replacement = references.get(replacement.key); }
      next.payloadKey = replacement.key;
      if (Object.hasOwn(next,"payloadHash")) next.payloadHash = replacement.payloadHash;
      if (Object.hasOwn(next,"hash")) next.hash = replacement.hash;
      changed = true;
    }
    if (changed && SEALED.has(next.format)) {
      const integrityField = next.format === "code3-workspace-recovery" ? "integrity" : "hash";
      const {[integrityField]: originalIntegrity,...originalBody} = current;
      if (sha256Text(canonicalStringify(originalBody)) !== originalIntegrity) throw new Error("An existing eBay safety copy failed its integrity check. Its original bytes were kept.");
      const { [integrityField]: ignored, ...payload } = next;
      void ignored;
      next[integrityField] = sha256Text(canonicalStringify(payload));
    }
    return changed ? next : current;
  }
  return walk(value);
}

export function redactedPayloadLocation(key, raw) {
  const parsed = JSON.parse(raw);
  const hash = parsed.hash;
  const payloadHash = sha256Text(canonicalStringify(raw));
  const suffix = key.startsWith("recovery:") ? payloadHash : hash;
  if (!/^[a-f0-9]{64}$/.test(suffix || "") || !/:[a-f0-9]{64}$/.test(key)) throw new Error("The privacy safety-copy key could not be verified.");
  return { key: key.replace(/:[a-f0-9]{64}$/, `:${suffix}`), hash, payloadHash };
}
