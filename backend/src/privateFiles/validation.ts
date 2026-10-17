import { createHash } from "node:crypto";
import { CANONICAL_DOMAINS } from "../code3/types";
import { PRIVATE_FILE_LIMITS, fileError, type PrivateFile, type StoredPrivateFile } from "./contracts";

export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function recordReference(domain: unknown, id: unknown) {
  if (typeof domain !== "string" || !CANONICAL_DOMAINS.includes(domain as never) || domain === "FILE_ASSET" || !validId(id)) {
    throw fileError("invalid_file_reference", 400, "Choose a saved record for this attachment.");
  }
  return { relatedRecordType: domain as PrivateFile["relatedRecordType"], relatedRecordId: id };
}

export function originalName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 180 || /[\x00-\x1f\x7f/\\]/.test(value) || value === "." || value === "..") {
    throw fileError("invalid_file_name", 400, "Use a file name of 1–180 characters without paths or control characters.");
  }
  return value.trim();
}

// An allowlist and structural signatures reject mislabeled/obviously truncated inputs.
// This is not malware scanning or a guarantee that a PDF/image is harmless.
export function validateBytes(bytes: Buffer, declaredMime: unknown): PrivateFile["mimeType"] {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > PRIVATE_FILE_LIMITS.fileBytes) {
    throw fileError("file_size_invalid", 413, "Choose a nonempty file no larger than 8 MB.");
  }
  let detected: PrivateFile["mimeType"] | null = null;
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR"
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
    && bytes.subarray(-12).equals(Buffer.from("0000000049454e44ae426082", "hex"))) detected = "image/png";
  if (bytes.length >= 16 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) detected = "image/jpeg";
  if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
    && bytes.readUInt32LE(4) === bytes.length - 8 && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) detected = "image/webp";
  if (bytes.length >= 24 && /^%PDF-(?:1\.[0-7]|2\.0)/.test(bytes.toString("ascii", 0, 8))
    && /%%EOF\s*$/.test(bytes.subarray(-32).toString("ascii"))) detected = "application/pdf";
  if (!detected || detected !== declaredMime) throw fileError("file_type_invalid", 415, "The file contents must match a supported PNG, JPEG, WebP or PDF type.");
  return detected;
}

export function verifiedBytes(file: StoredPrivateFile): Buffer {
  const encoded = file.bytesBase64;
  if (typeof encoded !== "string" || encoded.length > Math.ceil(PRIVATE_FILE_LIMITS.fileBytes / 3) * 4
    || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw fileError("file_bytes_missing", 409, "Attachment bytes are missing or unreadable. The backup is incomplete.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || bytes.length !== file.size || digest(bytes) !== file.sha256) {
    throw fileError("file_integrity_failed", 409, "An attachment failed its integrity check. The backup is incomplete.");
  }
  validateBytes(bytes, file.mimeType);
  return bytes;
}

const FIELDS = new Set(["id", "originalName", "mimeType", "size", "sha256", "relatedRecordType", "relatedRecordId", "createdAt", "retainUntil", "deletedAt", "bytesBase64"]);
export function validateStoredFile(value: unknown): StoredPrivateFile {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !FIELDS.has(key))) {
    throw fileError("file_metadata_invalid", 409, "Attachment metadata is unreadable.");
  }
  const file = value as StoredPrivateFile;
  recordReference(file.relatedRecordType, file.relatedRecordId);
  originalName(file.originalName);
  if (!validId(file.id) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > PRIVATE_FILE_LIMITS.fileBytes
    || !/^[a-f0-9]{64}$/.test(file.sha256) || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.mimeType)
    || ![file.createdAt, file.retainUntil].every((date) => typeof date === "string" && Number.isFinite(Date.parse(date)))
    || Date.parse(file.retainUntil) < Date.parse(file.createdAt)
    || (file.deletedAt !== null && (typeof file.deletedAt !== "string" || !Number.isFinite(Date.parse(file.deletedAt)) || file.bytesBase64 !== null))) {
    throw fileError("file_metadata_invalid", 409, "Attachment metadata is unreadable.");
  }
  return structuredClone(file);
}

export function publicFile(file: StoredPrivateFile): PrivateFile {
  const { bytesBase64: _bytes, ...metadata } = file;
  return metadata;
}
