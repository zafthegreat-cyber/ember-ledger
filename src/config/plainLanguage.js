import { BRAND_CONFIG } from "./brand.js";

const EXACT_VISIBLE_LABELS = new Map([
  ["Ember & Tide", BRAND_CONFIG.applicationDisplayName],
  ["Hearth", "Home"],
  ["Scout", "Restocks"],
  ["Flip Scout", "Deal Finder"],
  ["Vault", "Collection"],
  ["Forge", "Business"],
  ["Ledger", "Money"],
  ["Tide Chart", "Business Snapshot"],
  ["Ask Ember", "Business Assistant"],
  ["Ember Assist", "Business Assistant"],
  ["The Spark", "Kids & Community"],
  ["Tidepool", "Community"],
  ["TideTradr", "Product Research"],
  ["Harbor", "Listings"],
  ["Today's Tide", "Today"],
  ["Today’s Tide", "Today"],
]);

const VISIBLE_PHRASE_REPLACEMENTS = [
  [/Ember\s*&\s*Tide/gi, BRAND_CONFIG.applicationDisplayName],
  [/Ask Ember/gi, "Business Assistant"],
  [/Ember Assist/gi, "Business Assistant"],
  [/Flip Scout/gi, "Deal Finder"],
  [/The Spark/gi, "Kids & Community"],
  [/Today(?:'|’)s Tide/gi, "Today"],
  [/Tide Chart/gi, "Business Snapshot"],
  [/Hearth Command Center/gi, "Home"],
  [/Hearth Home/gi, "Home"],
  [/Back to Hearth/gi, "Back to Home"],
  [/Go to Hearth/gi, "Go to Home"],
  [/Open Hearth/gi, "Open Home"],
  [/\bon Hearth\b/gi, "on Home"],
  [/Scout Command Center/gi, "Restock Intelligence"],
  [/Scout Signals/gi, "Restock Signals"],
  [/Scout Report Review/gi, "Restock Report Review"],
  [/Scout reports?/gi, (match) => match.endsWith("s") ? "restock reports" : "restock report"],
  [/Scout protections/gi, "Sourcing protections"],
  [/Scout privacy/gi, "Sourcing privacy"],
  [/Scout fairness/gi, "Sourcing fairness"],
  [/Scout points/gi, "Report points"],
  [/Open Scout/gi, "Open Restocks"],
  [/Add Scout report/gi, "Add restock report"],
  [/Save Scout Report/gi, "Save restock report"],
  [/Restock Scout/gi, "Restock Intelligence"],
  [/Vault Command Center/gi, "Collection"],
  [/Vault Collection/gi, "Collection"],
  [/Vault Settings/gi, "Collection Settings"],
  [/Vault Sets/gi, "Collection Sets"],
  [/Vault activity/gi, "Collection activity"],
  [/Vault value/gi, "Collection value"],
  [/Empty Vault/gi, "Empty Collection"],
  [/Open Vault/gi, "Open Collection"],
  [/Start Vault/gi, "Start Collection"],
  [/Add to Vault/gi, "Add to Collection"],
  [/Move to Vault/gi, "Move to Collection"],
  [/\bin (?:your |the )?Vault\b/gi, "in your Collection"],
  [/Forge Command Center/gi, "Business"],
  [/Forge Workshop/gi, "Business Workspace"],
  [/Forge settings/gi, "Business settings"],
  [/Forge workspace/gi, "Business workspace"],
  [/Personal Forge/gi, "Personal Business Workspace"],
  [/Business Forge/gi, "Business Workspace"],
  [/Open Forge/gi, "Open Business"],
  [/Add to Forge/gi, "Add to Resale Inventory"],
  [/Move to Forge/gi, "Move to Resale Inventory"],
  [/\bin Forge\b/gi, "in Business"],
  [/Business Ledger/gi, "Business Records"],
  [/Sales Ledger/gi, "Sales Records"],
  [/private ledger/gi, "private records"],
  [/Tidepool Community/gi, "Community"],
  [/Open Tidepool/gi, "Open Community"],
  [/Market Watch/gi, "Product Research"],
  [/Open Spark/gi, "Open Kids & Community"],
  [/Spark status/gi, "Kids & Community status"],
];

export function plainLanguageText(value = "") {
  const source = String(value ?? "");
  const exact = EXACT_VISIBLE_LABELS.get(source.trim());
  if (exact && source.trim() === source) return exact;
  return VISIBLE_PHRASE_REPLACEMENTS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), source);
}

const VISIBLE_ATTRIBUTES = ["aria-label", "title", "placeholder"];
const SKIPPED_ELEMENTS = new Set(["SCRIPT", "STYLE", "CODE", "PRE"]);

function updateElementAttributes(element) {
  if (!(element instanceof Element)) return;
  for (const attribute of VISIBLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const next = plainLanguageText(current);
    if (next !== current) element.setAttribute(attribute, next);
  }
}

export function applyPlainLanguageToNode(root) {
  if (!root || typeof document === "undefined") return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (SKIPPED_ELEMENTS.has(root.parentElement?.tagName)) return;
    const next = plainLanguageText(root.nodeValue || "");
    if (next !== root.nodeValue) root.nodeValue = next;
    return;
  }
  if (!(root instanceof Element)) return;
  if (SKIPPED_ELEMENTS.has(root.tagName)) return;
  updateElementAttributes(root);
  root.querySelectorAll("[aria-label], [title], [placeholder]").forEach(updateElementAttributes);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!SKIPPED_ELEMENTS.has(node.parentElement?.tagName)) {
      const next = plainLanguageText(node.nodeValue || "");
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

export function observePlainLanguage(root) {
  if (!root || typeof MutationObserver === "undefined") return () => {};
  applyPlainLanguageToNode(root);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") applyPlainLanguageToNode(mutation.target);
      mutation.addedNodes.forEach(applyPlainLanguageToNode);
      if (mutation.type === "attributes") updateElementAttributes(mutation.target);
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: VISIBLE_ATTRIBUTES,
  });
  return () => observer.disconnect();
}
