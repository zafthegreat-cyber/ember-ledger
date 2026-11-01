/** Only absolute web links can leave the app; receipt/blob and app links use their own components. */
export function safeExternalWebUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return "";
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
