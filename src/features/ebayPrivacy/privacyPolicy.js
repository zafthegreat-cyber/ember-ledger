import { ebayIdentityHash, EBAY_IDENTITY_KINDS } from "./identityHash.js";

export const EBAY_PRIVACY_POLICY_KEY = "code3.ebay-privacy-tombstones.v1";
const MAX_TOMBSTONES = 100000;
const REMOVE = new Set([
  "sellerName","sellerUsername","sellerUserId","sellerEiasToken","sellerRating","sellerFeedbackScore","sellerFeedbackPercentage",
  "seller","sellerInfo","sellerDetails","sellerLocation","sellerEmail","sellerPhone","sellerAddress","ebayUserId","ebayEiasToken",
  "externalListingId","legacyListingId","listingId","itemId","itemWebUrl","listingUrl","originalListingUrl",
  "description","shortDescription","imageReferences","image","thumbnailImages","additionalImages","location","itemLocation","distance","distanceUnit",
  "providerPayload","rawPayload","rawResponse","sourcePayload",
  "sourceReference","sourceReferences",
]);
const EMPTY = Object.freeze({ version: 1, after: 0, tombstones: Object.freeze([]) });
function deviceStorage() { try { return globalThis.localStorage; } catch { return null; } }
export class EbayPrivacyError extends Error {
  constructor(code, message) { super(message); this.name = "EbayPrivacyError"; this.code = code; }
}
export function validateEbayPrivacyPolicy(value) {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.after) || value.after < 0 || !Array.isArray(value.tombstones)
    || value.tombstones.length > MAX_TOMBSTONES || value.tombstones.some((entry) => !entry || !EBAY_IDENTITY_KINDS.includes(entry.kind)
      || !/^[a-f0-9]{64}$/.test(entry.hash || "") || Object.keys(entry).some((key) => !["kind","hash"].includes(key)))) {
    throw new EbayPrivacyError("EBAY_PRIVACY_INVALID", "The eBay privacy policy could not be verified. Keep the device records and reconnect before retrying.");
  }
  return { version: 1, after: value.after, tombstones: value.tombstones.map(({kind,hash}) => ({kind,hash})) };
}
export function readEbayPrivacyPolicy(storage = deviceStorage()) {
  const raw = storage?.getItem(EBAY_PRIVACY_POLICY_KEY);
  if (!raw) return EMPTY;
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new EbayPrivacyError("EBAY_PRIVACY_INVALID", "The eBay privacy policy could not be read. Keep the device records and reconnect before retrying."); }
  return validateEbayPrivacyPolicy(value);
}
export function writeEbayPrivacyPolicy(policy, storage = deviceStorage()) {
  const checked = validateEbayPrivacyPolicy(policy);
  if (!storage?.setItem) throw new EbayPrivacyError("EBAY_PRIVACY_STORAGE", "Device privacy tracking is unavailable. Reconnect before using eBay records.");
  const raw = JSON.stringify(checked);
  storage.setItem(EBAY_PRIVACY_POLICY_KEY, raw);
  if (storage.getItem(EBAY_PRIVACY_POLICY_KEY) !== raw) throw new EbayPrivacyError("EBAY_PRIVACY_STORAGE", "Device privacy tracking could not be saved.");
  return checked;
}
function ebayRecord(record, inherited) {
  const provider = record.providerId ?? record.external_provider ?? record.provenance?.providerId;
  if (provider !== undefined) return String(provider).toLowerCase() === "ebay";
  if (record.marketplace) return /^ebay$/i.test(record.marketplace);
  return inherited || /^ebay[:_-]/i.test(record.sourceId || "") || /^eBay Browse API\b/.test(record.dataSource || "");
}
function identities(record) {
  const observationKinds = { SELLER_NAME: "username", SELLER_USER_ID: "userId", SELLER_EIAS_TOKEN: "eiasToken" };
  return [
    ["username",record.sellerName],["username",record.sellerUsername],["username",record.seller?.username],
    ["userId",record.sellerUserId],["userId",record.ebayUserId],["userId",record.seller?.userId],["eiasToken",record.sellerEiasToken],["eiasToken",record.ebayEiasToken],["eiasToken",record.seller?.eiasToken],
    ...[record.externalListingId,record.legacyListingId,record.listingId,record.itemId].map((value) => ["listingId",value]),
    ["listingId",record.externalIdentity?.externalListingId],
    ...(Array.isArray(record.observations) ? record.observations : []).filter((entry) => observationKinds[entry?.observationType]).map((entry) => [observationKinds[entry.observationType],entry.value]),
    ...[record.sourceId,record.underlyingSourceId,record.provenance?.sourceId,record.provenance?.underlyingSourceId].filter((entry) => typeof entry === "string" && entry.startsWith("ebay:") && !entry.startsWith("ebay:unidentified:") && entry.length > 5).map((entry) => ["listingId",entry.slice(5)]),
  ];
}
/** Exact digest/known-eBay matches only. Never removes rows or owner money fields. */
export function redactEbayPersonalData(value, policy = readEbayPrivacyPolicy()) {
  const checked = validateEbayPrivacyPolicy(policy);
  if (!checked.tombstones.length) return value;
  const hashes = new Set(checked.tombstones.map(({kind,hash}) => `${kind}:${hash}`));
  const matches = (record) => identities(record).some(([kind,identity]) => {
    const hash = ebayIdentityHash(kind,identity); return hash && hashes.has(`${kind}:${hash}`);
  });
  const affectedSourceIds = new Set();
  const affectedUrls = new Set();
  function collect(current, inherited = false, depth = 0, field = "") {
    if (depth > 60) throw new EbayPrivacyError("EBAY_PRIVACY_DEPTH", "An eBay record is nested too deeply to review safely.");
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) { current.forEach((entry) => collect(entry,field === "sourceEvidence" ? false : inherited,depth+1,field)); return; }
    const context = ebayRecord(current,inherited);
    if (context && (matches(current) || current.ebayPrivacyRedacted === true)) {
      if (typeof current.sourceId === "string" && !current.sourceId.startsWith("ebay:unidentified:")) affectedSourceIds.add(current.sourceId);
      for (const url of [current.listingUrl,current.originalListingUrl,current.itemWebUrl,current.externalIdentity?.listingUrl]) if (typeof url === "string" && url) affectedUrls.add(url);
    }
    for (const [key,entry] of Object.entries(current)) collect(entry,context,depth+1,key);
  }
  collect(value);
  function visit(current, inherited = false, affected = false, depth = 0, field = "") {
    if (depth > 60) throw new EbayPrivacyError("EBAY_PRIVACY_DEPTH", "An eBay record is nested too deeply to review safely.");
    if (!current || typeof current !== "object") return current;
    if (Array.isArray(current)) {
      let changed = false;
      const next = current.filter((entry) => {
        const remove = affected && field === "observations" && /^(?:SELLER_|LOCATION$|LISTING_DESCRIPTION$)/.test(entry?.observationType || "")
          || field === "images" && entry?.provenance?.providerId === "ebay" && (affected || affectedSourceIds.has(entry.provenance.sourceId))
          || field === "sourceReferences" && typeof entry === "string" && affectedUrls.has(entry);
        changed ||= remove; return !remove;
      }).map((entry) => { const independent = field === "sourceEvidence"; const result = visit(entry,independent ? false : inherited,independent ? false : affected,depth+1,field); changed ||= result !== entry; return result; });
      return changed ? next : current;
    }
    const context = ebayRecord(current,inherited);
    const directMatch = context && (matches(current) || current.ebayPrivacyRedacted === true || affectedSourceIds.has(current.sourceId));
    const matched = affected || directMatch;
    let changed = false;
    const next = {};
    for (const [key,entry] of Object.entries(current)) {
      if (["__proto__","prototype","constructor"].includes(key)) throw new EbayPrivacyError("EBAY_PRIVACY_UNSAFE_KEY", "The eBay record contains an unsupported field.");
      if (matched && REMOVE.has(key)) { changed = true; continue; }
      if (key === "sourceReference" && typeof entry === "string" && affectedUrls.has(entry)) { changed = true; continue; }
      const result = matched && ["sourceId","underlyingSourceId","independenceKey","evidenceId"].includes(key) && /^ebay[:-]/i.test(entry || "")
        ? "ebay-privacy-redacted" : visit(entry,context,matched,depth+1,key);
      changed ||= result !== entry;
      next[key] = result;
    }
    if (directMatch && current.ebayPrivacyRedacted !== true) { next.ebayPrivacyRedacted = true; changed = true; }
    if (changed && current.sourceInput && current.inputHash) { next.ebayPrivacyRedacted = true; next.privacyRequiresReanalysis = true; }
    return changed ? next : current;
  }
  return visit(value);
}

/** Add only listing identities proven to belong to an exact deleted seller. */
export function deriveEbayListingTombstones(value, policy) {
  const checked = validateEbayPrivacyPolicy(policy);
  const entries = new Map(checked.tombstones.map((entry) => [`${entry.kind}:${entry.hash}`,entry]));
  function scan(current, inherited = false, depth = 0) {
    if (depth > 60) throw new EbayPrivacyError("EBAY_PRIVACY_DEPTH", "An eBay safety record is nested too deeply.");
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) { current.forEach((entry) => scan(entry,inherited,depth+1)); return; }
    const context = ebayRecord(current,inherited);
    const matched = context && identities(current).some(([kind,identity]) => {
      const hash = ebayIdentityHash(kind,identity); return hash && entries.has(`${kind}:${hash}`);
    });
    if (matched) for (const [kind,identity] of identities(current)) {
      if (kind !== "listingId") continue;
      const hash = ebayIdentityHash(kind,identity);
      if (hash) entries.set(`${kind}:${hash}`,{kind,hash});
    }
    for (const [key,entry] of Object.entries(current)) {
      if (key === "raws" && entry && typeof entry === "object") {
        for (const raw of Object.values(entry)) if (typeof raw === "string") {
          try { scan(JSON.parse(raw),false,depth+1); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
        }
      } else scan(entry,context,depth+1);
    }
  }
  scan(value);
  return validateEbayPrivacyPolicy({...checked,tombstones:[...entries.values()]});
}

/** Call through an already verified ordinary-user RPC wrapper, never service keys. */
export async function refreshEbayPrivacyPolicy({ rpc, storage = deviceStorage(), assertCurrent = () => {} }) {
  const current = readEbayPrivacyPolicy(storage);
  let after = current.after;
  const entries = new Map(current.tombstones.map((entry) => [`${entry.kind}:${entry.hash}`, entry]));
  for (let page = 0; page < 200; page++) {
    assertCurrent();
    const result = await rpc("code3_ebay_privacy_tombstones", { p_after: after, p_limit: 500 });
    assertCurrent();
    if (result?.error) throw new EbayPrivacyError("EBAY_PRIVACY_UNAVAILABLE", "eBay privacy updates are unavailable. Reconnect before retrying eBay records.");
    const body = result?.data ?? result;
    if (!body || !Array.isArray(body.tombstones) || body.tombstones.length > 500 || !Number.isSafeInteger(body.nextAfter)
      || body.nextAfter < after || typeof body.hasMore !== "boolean") throw new EbayPrivacyError("EBAY_PRIVACY_INVALID", "The eBay privacy response could not be verified.");
    let sequence = after;
    for (const row of body.tombstones) {
      if (!Number.isSafeInteger(row.sequence) || row.sequence <= sequence || row.sequence > body.nextAfter
        || !EBAY_IDENTITY_KINDS.includes(row.kind) || !/^[a-f0-9]{64}$/.test(row.hash || "")) throw new EbayPrivacyError("EBAY_PRIVACY_INVALID", "The eBay privacy response could not be verified.");
      entries.set(`${row.kind}:${row.hash}`,{kind:row.kind,hash:row.hash}); sequence = row.sequence;
    }
    if (body.hasMore && body.nextAfter <= after || entries.size > MAX_TOMBSTONES) throw new EbayPrivacyError("EBAY_PRIVACY_LIMIT", "eBay privacy updates require a newer app before they can finish.");
    after = body.nextAfter;
    if (!body.hasMore) { assertCurrent(); return writeEbayPrivacyPolicy({version:1,after,tombstones:[...entries.values()]},storage); }
  }
  throw new EbayPrivacyError("EBAY_PRIVACY_LIMIT", "eBay privacy updates did not finish. Reconnect before using eBay records.");
}
