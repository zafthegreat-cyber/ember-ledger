export const MEMBER_PATHS = Object.freeze({
  collector: { label: "Collect for myself or my family", title: "Save one item you already own", body: "Choose a card or sealed product, add its name in Vault, then save. You’ll see it in your collection. Start with one item; photos, prices, and extra details can wait.", action: "Add my first collection item", destination: "Vault · My collection" },
  seller: { label: "Organize resale records", title: "Review your inventory workspace", body: "Open Forge to review inventory and sales tools. Your next step is one inventory record you can check before saving. A selling record is separate from a public listing.", action: "Open seller inventory", destination: "Forge · Inventory & sales" },
  shop: { label: "Explore as a shop", title: "Review shop participation first", body: "Contact support with your shop’s public name and what you need. Public shop features may require review; choosing this introduction does not verify a shop or grant staff access.", action: "Review shop support", destination: "Support · Shop questions" },
});
export const MEMBER_DESTINATIONS = Object.freeze([
  ["Hearth", "Home dashboard"], ["Vault", "My collection"], ["Scout", "Restock reports"],
  ["Forge", "Inventory & sales"], ["Market", "Price research"], ["Tidepool", "Community"],
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const memberPreferenceKey = userId => uuid.test(String(userId || "")) ? `code3:member-intro:v1:${userId}` : "";
export function readMemberIntro(storage, userId) {
  const empty = { path: "collector", hidden: false };
  try {
    const key = memberPreferenceKey(userId); if (!key) return empty;
    const value = JSON.parse(storage.getItem(key));
    return { path: Object.hasOwn(MEMBER_PATHS, value?.path) ? value.path : "collector", hidden: value?.hidden === true };
  } catch { return empty; }
}
export function saveMemberIntro(storage, userId, value) {
  try {
    const key = memberPreferenceKey(userId); if (!key) return false;
    storage.setItem(key, JSON.stringify({ path: Object.hasOwn(MEMBER_PATHS, value?.path) ? value.path : "collector", hidden: value?.hidden === true }));
    return true;
  } catch { return false; }
}
