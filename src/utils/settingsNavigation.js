export const SETTINGS_CATEGORIES = ["Everyday", "Account", "Privacy", "Help"];

// Match every word across labels and common terms, regardless of the selected category.
export function matchesSetting(setting, query, category) {
  const words = String(query || "").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return setting.category === category;
  const searchable = [setting.title, setting.description, setting.keywords, setting.category].join(" ").toLocaleLowerCase();
  return words.every(word => searchable.includes(word));
}
