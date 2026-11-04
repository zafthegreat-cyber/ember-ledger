// Public app invitation only. Never add account IDs, tokens or workspace data.
export const PUBLIC_APP_INVITE_URL = "https://code3tcg.app/scout/reports?utm_source=app&utm_medium=share&utm_campaign=regional-restocks";

export async function sharePublicApp(navigatorLike = globalThis.navigator) {
  if (typeof navigatorLike?.share === "function") {
    try {
      await navigatorLike.share({ title: "Code 3 TCG", text: "Find community restock reports across VA, NC, MD and DC. Create a free account and share what you observe.", url: PUBLIC_APP_INVITE_URL });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  try {
    if (typeof navigatorLike?.clipboard?.writeText === "function") {
      await navigatorLike.clipboard.writeText(PUBLIC_APP_INVITE_URL);
      return "copied";
    }
  } catch { /* Leave a selectable public link when clipboard access is blocked. */ }
  return "manual";
}
