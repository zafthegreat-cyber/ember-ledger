export { STORE_GROUP_ORDER } from "../data/storeGroups";
import { STORE_GROUP_ORDER } from "../data/storeGroups";

function normalizedStoreText(store = {}) {
  return [
    store.storeGroup,
    store.chain,
    store.name,
    store.nickname,
    store.storeType,
    store.store_type,
    store.type,
    store.category,
    store.banner,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getStoreGroup(store = {}) {
  if (store.storeGroup && STORE_GROUP_ORDER.includes(store.storeGroup)) return store.storeGroup;

  const text = normalizedStoreText(store);
  const chain = String(store.chain || "").toLowerCase();
  const type = String(store.storeType || store.store_type || store.type || "").toLowerCase();

  if (chain.includes("target") || text.includes(" target")) return "Target";
  if (chain.includes("walmart neighborhood") || text.includes("neighborhood market")) return "Walmart Neighborhood Market";
  if (chain.includes("walmart") || text.includes(" walmart")) return "Walmart";
  if (["costco", "sam's club", "sams club", "bj's", "bjs", "bj's wholesale", "warehouse"].some((term) => text.includes(term))) return "Warehouse Clubs";
  if (text.includes("best buy")) return "Best Buy";
  if (["barnes", "books-a-million", "books a million", "hobby lobby", "michaels", "gamestop", "game stop"].some((term) => text.includes(term))) return "Bookstores / Hobby";
  if (["dollar general", "family dollar", "dollar tree", "five below"].some((term) => text.includes(term))) return "Dollar / Discount Stores";
  if (["kroger", "harris teeter", "walgreens", "cvs", "pharmacy", "grocery"].some((term) => text.includes(term) || type.includes(term))) return "Grocery / Pharmacy";
  if (["card shop", "game shop", "local", "collectibles", "hobby shop", "comic"].some((term) => text.includes(term) || type.includes(term))) return "Local Card Shops";
  return "Other";
}

export function normalizeStoreGroup(store = {}) {
  return { ...store, storeGroup: getStoreGroup(store) };
}

export function sortStoresByDisplayName(a, b) {
  return String(a.nickname || a.name || "").localeCompare(String(b.nickname || b.name || ""));
}
