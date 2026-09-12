import { Code3ValidationError, validateUuid } from "./validation";

export type DecodedCursor = Readonly<{ createdAt: string; id: string }>;

export function encodeCursor(value: DecodedCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor(value: string): DecodedCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Object.keys(parsed).sort().join(",") !== "createdAt,id") throw new Error("invalid shape");
    if (typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))) throw new Error("invalid timestamp");
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: validateUuid(parsed.id, "cursor.id") };
  } catch {
    throw new Code3ValidationError({ path: "cursor", code: "invalid_cursor", message: "cursor is invalid." });
  }
}
