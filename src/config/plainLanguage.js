import { BRAND_CONFIG, formatBrandText } from "./brand.js";

const EXACT_VISIBLE_LABELS = new Map([
  ["Ember & Tide", BRAND_CONFIG.applicationDisplayName],
  ["Ember and Tide", BRAND_CONFIG.applicationDisplayName],
  ["Private Business Hub", BRAND_CONFIG.applicationDisplayName],
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
  [/Private Business Hub/gi, BRAND_CONFIG.applicationDisplayName],
  [/Ask Ember(?: Assist)?/gi, "Business Assistant"],
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
  [/Scout protections/gi, "Sourcing protections"],
  [/Scout privacy/gi, "Sourcing privacy"],
  [/Scout fairness/gi, "Sourcing fairness"],
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

// 2026-10-30: the names "Forge" and "Scout" are retired from everything a
// person reads. Routes, storage keys, database names and code symbols keep the
// old words (see the backlog branding rule); these rules only touch copy.
// Order matters: people-phrases first, then noun phrases, then the bare words.
function sentenceCase(word, offset, source) {
  const before = String(source || "").slice(0, offset).replace(/\s+$/, "");
  const startsSentence = !before || /[.!?:]$/.test(before) || /\n$/.test(String(source || "").slice(0, offset));
  return startsSentence ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
const nounPhrase = (noun) => (match, ...rest) => {
  const source = rest[rest.length - 1];
  const offset = rest[rest.length - 2];
  const plural = /s$/i.test(match) && !/\b(details|history|data|context|signals|patterns|protections|privacy|fairness|access|tools|routes|map|feed|notifications|status)$/i.test(noun) ? "s" : "";
  const word = `${noun}${plural}`;
  return match.charAt(0) === match.charAt(0).toUpperCase() && /[A-Z]/.test(match.charAt(0)) ? sentenceCase(word, offset, source) : word;
};
export const LEGACY_NAME_REPLACEMENTS = [
  [/\bFlip Scout\b/g, "Deal Finder"],
  [/\bRestock Scout\b/g, "Restock Intelligence"],
  [/\bTrusted Scouts?\b/g, (m) => m.endsWith("s") ? "Trusted Reporters" : "Trusted Reporter"],
  [/\bActive Scouts?\b/g, (m) => m.endsWith("s") ? "Active Reporters" : "Active Reporter"],
  [/\bNew Scouts?\b/g, (m) => m.endsWith("s") ? "New Reporters" : "New Reporter"],
  [/\b[Ss]cout points?\b/g, nounPhrase("restock point")],
  [/\b[Ss]cout reports?\b/g, nounPhrase("restock report")],
  [/\b[Ss]cout stores?\b/g, nounPhrase("watched store")],
  [/\b[Ss]cout alerts?\b/g, nounPhrase("restock alert")],
  [/\b[Ss]cout helpers?\b/g, nounPhrase("restock helper")],
  [/\b[Ss]cout (details|history|data|context|signals?|patterns?|protections?|privacy|fairness|access|tools?|routes?|map|feed|notifications?|status)\b/g, (m, noun, offset, source) => (/^S/.test(m) ? sentenceCase(`restock ${noun}`, offset, source) : `restock ${noun}`)],
  [/\bScout Command Center\b/g, "Restock Intelligence"],
  [/\bScouts\b/g, "restock reporters"],
  [/\bScout(?:'|’)s\b/g, "reporter's"],
  [/\bScouting\b/g, "Restock reporting"],
  [/\bScout\b/g, "Restocks"],
  [/\bForge [Bb]usiness\b/g, "Business"],
  [/\bBusiness Forge\b/g, "Business Workspace"],
  [/\bPersonal Forge\b/g, "Personal Business Workspace"],
  [/\bForge\b/g, "Business"],
  // Old brand feature names (tester reactions A41/A42: "Is it Ember & Tide or Code 3?").
  [/\bAsk Ember(?: Assist)?\b/g, "Business Assistant"],
  [/\bEmber Assist\b/g, "Business Assistant"],
  [/\bEmber Watch\b/g, "Watch Center"],
  [/\bEmber ID\b/g, "Public Profile"],
  [/\bEmber Points?\b/g, (m) => m.endsWith("s") ? "Daily Points" : "Daily Point"],
  [/\bTide Watch\b/g, "Watch Center"],
  [/\bTide Score\b/g, "Trust Score"],
  [/\bTide Points?\b/g, (m) => m.endsWith("s") ? "Daily Points" : "Daily Point"],
  [/\bTide Forecast\b/g, "Restock Forecast"],
  [/\bTide Refresh\b/g, "Refresh"],
  [/\bTidepool Community\b/g, "Community"],
  [/\bTidepool\b/g, "Community"],
  [/\bHearth\b/g, "Home"],
];

export function renameLegacyProductNames(value = "") {
  return LEGACY_NAME_REPLACEMENTS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), String(value ?? ""));
}

export function plainLanguageText(value = "") {
  const source = String(value ?? "");
  const exact = EXACT_VISIBLE_LABELS.get(source.trim());
  if (exact && source.trim() === source) return exact;
  const phrased = VISIBLE_PHRASE_REPLACEMENTS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), formatBrandText(source));
  return renameLegacyProductNames(phrased);
}

const VISIBLE_ATTRIBUTES = ["aria-label", "title", "placeholder", "alt"];
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
  root.querySelectorAll("[aria-label], [title], [placeholder], [alt]").forEach(updateElementAttributes);
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
