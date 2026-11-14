// Per-persona onboarding checklist (SHOULD 15, 2026-11-14).
//
// Three steps, never more, computed from what the person has actually done
// (not from a wizard they clicked through). Pure: the component decides when
// to render; this module decides what the steps are and which are done.
//
//   buildPersonaChecklist({ persona, kidSafe, counts }) → { key, title, intro, steps[], done, total, complete }
//
// counts: { vaultItems, followedStores, marketSearches, watchlist, inventory,
//           receipts, sales, reports, publicProfile, tourSeen }

export const CHECKLIST_STORAGE_PREFIX = "code3-onboarding-checklist-v1";

const n = (value) => Math.max(0, Number(value) || 0);

const CHECKLISTS = {
  collector: {
    title: "Three quick steps to make this yours",
    intro: "Each one takes under a minute. Skip any you don't need.",
    steps: [
      { key: "vault", label: "Add your first card or product", detail: "Scan it, search it, or type it in. Your collection starts here.", target: "collectionWorkspace", isDone: (c) => n(c.vaultItems) > 0 },
      { key: "store", label: "Follow a store you visit", detail: "You'll see restock reports for it first.", target: "restocks", isDone: (c) => n(c.followedStores) > 0 },
      { key: "market", label: "Look up one price", detail: "Search Market for a card you're curious about and save it to your wants.", target: "market", isDone: (c) => n(c.marketSearches) > 0 || n(c.watchlist) > 0 },
    ],
  },
  seller: {
    title: "Set up your records in three steps",
    intro: "Nothing here is shared. These are your private business records.",
    steps: [
      { key: "inventory", label: "Add one item you plan to sell", detail: "Cost, condition and where it is. Everything else is optional.", target: "business:inventory", isDone: (c) => n(c.inventory) > 0 },
      { key: "receipt", label: "Save one receipt or expense", detail: "A photo is enough. It keeps year-end honest.", target: "business:expenses", isDone: (c) => n(c.receipts) > 0 },
      { key: "sale", label: "Record a sale", detail: "Price, fees and shipping. Profit shows up on Home after this.", target: "business:sales", isDone: (c) => n(c.sales) > 0 },
    ],
  },
  store: {
    title: "Three steps for your shop",
    intro: "Collectors nearby find shops through restock reports and the store directory.",
    steps: [
      { key: "inventory", label: "Add inventory you have on the shelf", detail: "Start with sealed product; cards can follow.", target: "business:inventory", isDone: (c) => n(c.inventory) > 0 },
      { key: "report", label: "Post a restock report for your own shop", detail: "Tell collectors what came in. Photos are optional.", target: "report-restock", isDone: (c) => n(c.reports) > 0 },
      { key: "profile", label: "Finish your public profile", detail: "Name, hours and how to reach you.", target: "publicProfile", isDone: (c) => Boolean(c.publicProfile) },
    ],
  },
  kid: {
    title: "Three things to try",
    intro: "Ask a grown-up if you get stuck.",
    steps: [
      { key: "vault", label: "Add a favorite card", detail: "Find it and tap Add to Vault.", target: "collectionWorkspace", isDone: (c) => n(c.vaultItems) > 0 },
      { key: "set", label: "Look at a set you're collecting", detail: "See which cards you have and which you still want.", target: "collectionWorkspace:sets", isDone: (c) => n(c.vaultItems) >= 3 },
      { key: "tour", label: "Take the tour", detail: "Six short steps that show where everything is.", target: "tour", isDone: (c) => Boolean(c.tourSeen) },
    ],
  },
};

export function checklistKeyFor({ persona = "collector", kidSafe = false } = {}) {
  if (kidSafe) return "kid";
  return CHECKLISTS[persona] ? persona : "collector";
}

export function buildPersonaChecklist({ persona = "collector", kidSafe = false, counts = {} } = {}) {
  const key = checklistKeyFor({ persona, kidSafe });
  const definition = CHECKLISTS[key];
  const steps = definition.steps.slice(0, 3).map((step) => ({ key: step.key, label: step.label, detail: step.detail, target: step.target, done: Boolean(step.isDone(counts)) }));
  const done = steps.filter((step) => step.done).length;
  return { key, title: definition.title, intro: definition.intro, steps, done, total: steps.length, complete: done === steps.length, nextStep: steps.find((step) => !step.done) || null };
}

export function checklistStorageKey(key) {
  return `${CHECKLIST_STORAGE_PREFIX}:${key}`;
}

export function isChecklistDismissed(key, storage = globalThis.localStorage) {
  try { return storage?.getItem(checklistStorageKey(key)) === "dismissed"; } catch { return false; }
}

export function dismissChecklist(key, storage = globalThis.localStorage) {
  try { storage?.setItem(checklistStorageKey(key), "dismissed"); } catch { /* storage unavailable */ }
}

/** Visible when not dismissed and not every step is done. */
export function shouldShowChecklist(checklist, storage = globalThis.localStorage) {
  if (!checklist || checklist.complete) return false;
  return !isChecklistDismissed(checklist.key, storage);
}
