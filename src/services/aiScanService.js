// AI scan (Nov 20 2026, paid plans): shrinks a photo on the device and asks the
// scanner-ai-identify edge function what the item is. Only the shrunk photo is
// sent, only when the member taps "Identify with AI", and it is not stored.
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const MAX_EDGE = 2000; // small card numbers need detail; Opus reads up to 2576 px

async function loadImage(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** JPEG, longest edge at most 2000 px, as base64 without the data: prefix. */
export async function shrinkPhotoForAi(file) {
  const source = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    source.close?.();
  }
}

/**
 * Returns { ok: true, result, remaining } or { ok: false, code, message }.
 * code: signed_out | upgrade | minor | limit | bad_photo | failed | offline
 */
export async function identifyWithAi(file, { kind = "card", hint = "" } = {}) {
  if (!isSupabaseConfigured || !supabase) return { ok: false, code: "offline", message: "AI scans need an internet connection and a signed-in account." };
  let image;
  try {
    image = await shrinkPhotoForAi(file);
  } catch {
    return { ok: false, code: "bad_photo", message: "The photo could not be prepared. Try another photo." };
  }
  const { data, error } = await supabase.functions.invoke("scanner-ai-identify", { body: { kind, hint: String(hint || "").slice(0, 200), image } });
  if (!error && data?.result) return { ok: true, result: data.result, remaining: Number.isFinite(data.remaining) ? data.remaining : null };
  let body = null;
  try { body = await error?.context?.json?.(); } catch { body = null; }
  return {
    ok: false,
    code: body?.code || "failed",
    message: body?.error || "AI scan did not finish. Check your connection and try again.",
    remaining: Number.isFinite(body?.remaining) ? body.remaining : null,
  };
}

export { describeAiScan } from "../utils/aiScanText.mjs";
