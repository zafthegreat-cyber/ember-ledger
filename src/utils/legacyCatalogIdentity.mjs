const PREFIX = "[CODE3_CATALOG_IDENTITY_V1] ";
const FIELDS = Object.freeze(["catalogProductId","tcgplayerProductId","name","setName","cardNumber","tcgGame","language","edition","variant","finish","printing","productClassification","imageUrl","photoUrl"]);
const REQUIRED_IDENTITY_FIELDS = new Set(["catalogProductId", "name", "tcgGame"]);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function sanitizeLegacyCatalogIdentity(value = {}) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const key of FIELDS) {
    if (!Object.hasOwn(value,key) || !["string","number"].includes(typeof value[key])) continue;
    const content=String(value[key]);
    // Explicit empty optional fields are tombstones: a later ordinary edit
    // must be able to clear a previous annotation. Missing fields remain
    // untouched, and names/catalog identifiers cannot be erased this way.
    if (content === "" && !REQUIRED_IDENTITY_FIELDS.has(key)) {
      result[key] = "";
      continue;
    }
    if (!content.trim() || content.length > (key.endsWith("Url") ? 2048 : 400) || /[\u0000-\u001f\u007f]/.test(content)) continue;
    if (key === "tcgplayerProductId" && (!/^\d+$/.test(content) || !Number.isSafeInteger(Number(content)))) continue;
    if (key.endsWith("Url") && !/^(?:https?:\/\/|\/(?!\/))/.test(content)) continue;
    result[key]=content;
  }
  return result;
}

// Never parse arbitrary notes as records. Only this exact namespace/version
// and the narrow identity whitelist can decorate the mapped original record.
export function readLegacyCatalogIdentity(notes = "") {
  let identity={};
  for (const line of String(notes || "").split(/\r?\n/)) {
    if (!line.startsWith(PREFIX)) continue;
    try {
      const payload=JSON.parse(line.slice(PREFIX.length));
      if (payload?.version === 1) identity={...identity,...sanitizeLegacyCatalogIdentity(payload.identity)};
    } catch { /* A damaged annotation cannot change the existing record. */ }
  }
  return identity;
}

/** Append an explicitly reviewed identity to the original notes, retaining
 * every existing byte and annotation. Local catalog IDs live only in this
 * annotation; the UUID database column receives only a validated UUID. */
export function buildLegacyCatalogIdentityUpdate({notes = "",identity = {}} = {}) {
  const original=String(notes ?? ""),patch=sanitizeLegacyCatalogIdentity(identity);
  if (!Object.keys(patch).length) return {actionNotes:original,identity:readLegacyCatalogIdentity(original),serverPatch:{}};
  const previous=readLegacyCatalogIdentity(original);
  // An explicitly replaced catalog product cannot inherit the old product's
  // provider link. Partial name/finish edits and reads never infer a removal.
  if (Object.hasOwn(patch,"catalogProductId") && patch.catalogProductId !== previous.catalogProductId && !Object.hasOwn(patch,"tcgplayerProductId")) patch.tcgplayerProductId="";
  const latest={...previous,...patch};
  const newline=original.includes("\r\n") ? "\r\n" : "\n";
  const actionNotes=original+(original && !original.endsWith("\n") ? newline : "")+PREFIX+JSON.stringify({version:1,identity:latest});
  const serverPatch={action_notes:actionNotes};
  // A reviewed local ID replaces any old database UUID link without trying to
  // write the local string into that typed column. Omitted IDs leave it alone.
  if (Object.hasOwn(patch,"catalogProductId")) serverPatch.catalog_product_id=uuid(patch.catalogProductId) ? patch.catalogProductId : null;
  if (patch.tcgplayerProductId && /^\d+$/.test(patch.tcgplayerProductId) && Number.isSafeInteger(Number(patch.tcgplayerProductId))) serverPatch.tcgplayer_product_id=patch.tcgplayerProductId;
  else if (patch.tcgplayerProductId === "") serverPatch.tcgplayer_product_id=null;
  return {actionNotes,identity:latest,serverPatch};
}
