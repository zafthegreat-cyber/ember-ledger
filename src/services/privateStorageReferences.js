import { classifyReceiptReference } from "./privateReceiptAccess.js";

// Only public project configuration is needed to recognize a saved object. No
// session or credential is captured in a persisted reference.
export const configuredPrivateStorageProjectUrl = import.meta.env?.VITE_SUPABASE_URL || "";

const IMAGE_REFERENCE_KEYS = new Set([
  "image", "images", "imageurl", "imageurls", "imagesrc", "imageuri", "itemimage", "displayimage",
  "itemimageurl", "productimageurl", "referenceimage", "photo", "photos", "photourl", "photourls",
  "receiptimage", "receiptimageurl", "receiptphoto", "receiptphotourl", "gasreceiptimage",
  "proofurl", "evidenceurl", "attachmenturl", "attachmenturls",
]);
const keyOf = (key) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

/** A token-free locator, not a public or authorized download URL. */
export function createPrivateStorageReference({ bucket, path } = {}, projectUrl = configuredPrivateStorageProjectUrl) {
  if (typeof bucket !== "string" || typeof path !== "string") throw new Error("A valid private image reference is required.");
  let origin;
  try { origin = new URL(projectUrl).origin; } catch { throw new Error("Private image storage is not configured."); }
  const reference = `${origin}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const checked = classifyReceiptReference(reference, projectUrl);
  if (checked.kind !== "private" || checked.bucket !== bucket || checked.path !== path) throw new Error("A valid private image reference is required.");
  return reference;
}

/** Legacy same-project links keep their exact object identity without tokens. */
export function normalizePrivateStorageReference(value, projectUrl = configuredPrivateStorageProjectUrl) {
  const reference = classifyReceiptReference(value, projectUrl);
  return reference.kind === "private" ? createPrivateStorageReference(reference, projectUrl) : value;
}

/** Trust object identity only for canonical locators under known image fields. */
export function isCanonicalPrivateImageReference(value, key, projectUrl = configuredPrivateStorageProjectUrl) {
  if (typeof key !== "string" || !IMAGE_REFERENCE_KEYS.has(keyOf(key)) || typeof value !== "string") return false;
  const reference = classifyReceiptReference(value, projectUrl);
  return reference.kind === "private" && value === createPrivateStorageReference(reference, projectUrl);
}

/**
 * Project only registered image fields in a copy. Arbitrary notes, foreign URLs,
 * security fields and original device bytes stay unchanged; the normal security
 * validator must still reject any credentials outside these known references.
 */
export function projectPrivateImageReferences(value, projectUrl = configuredPrivateStorageProjectUrl, imageField = false) {
  if (typeof value === "string") return imageField ? normalizePrivateStorageReference(value, projectUrl) : value;
  if (Array.isArray(value)) return value.map((entry) => projectPrivateImageReferences(entry, projectUrl, imageField));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    projectPrivateImageReferences(child, projectUrl, IMAGE_REFERENCE_KEYS.has(keyOf(key))),
  ]));
}
