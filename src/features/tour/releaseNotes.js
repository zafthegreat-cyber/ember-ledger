// What's new (COULD 31 / tour v2, 2026-11-14).
//
// One entry per release that changed something people can see. Newest first.
// `id` is stable; Home shows the newest entry once (dismissal stores the id),
// the Announcements page lists them all. Keep each body to one sentence a
// collector would care about; engineering detail goes in the ledger.
export const WHATS_NEW_SEEN_KEY = "code3-whats-new-seen-v1";

export const RELEASE_NOTES = [
  {
    id: "2026-11-14-should-batch2",
    date: "2026-11-14",
    title: "Faster reports, smarter search, everything unlocked for beta",
    body: "Report a restock from Home in two taps, search by Japanese set names and codes, save your Market searches, and every member plan's features are on for everyone while the beta runs.",
    highlights: ["Two-tap restock report on Home", "Japanese ↔ English set search", "Saved Market searches", "Getting-started checklist", "Trade analyzer suggests values when one side is blank", "Purchase returns in Business"],
    type: "App update",
    priority: "highlight",
    ctaLabel: "Try the quick report",
    ctaDestination: "home",
  },
  {
    id: "2026-11-13-open-beta",
    date: "2026-11-13",
    title: "Open beta, feedback button, calmer pages",
    body: "Anyone can join now, there is a Feedback button on every screen, crash reports are on (anonymous, opt-out in Privacy), and the main pages show less at once.",
    highlights: ["Open to everyone", "Feedback button", "Quieter Home, Restocks, Vault, Market and Community"],
    type: "App update",
    priority: "normal",
    ctaLabel: "Send feedback",
    ctaDestination: "feedback",
  },
  {
    id: "2026-11-06-tour-and-colors",
    date: "2026-11-06",
    title: "Guided tour, easier sign out, new colors",
    body: "A six-step tour from the Menu, Sign out where you expect it, warmer dark mode with teal accents, and the old Nest/Lantern names are gone.",
    highlights: ["Take the tour from Menu", "Sign out on Menu and Account", "Warm palette"],
    type: "App update",
    priority: "normal",
    ctaLabel: "Take the tour",
    ctaDestination: "tour",
  },
];

export function latestReleaseNote() { return RELEASE_NOTES[0] || null; }

export function readWhatsNewSeen(storage = globalThis.localStorage) {
  try { return String(storage?.getItem(WHATS_NEW_SEEN_KEY) || ""); } catch { return ""; }
}

export function markWhatsNewSeen(id, storage = globalThis.localStorage) {
  try { storage?.setItem(WHATS_NEW_SEEN_KEY, String(id || "")); } catch { /* storage unavailable */ }
}

/** Entries newer than the one last seen (all of them for a first visit). */
export function whatsNewSince(seenId, notes = RELEASE_NOTES) {
  if (!seenId) return notes.slice();
  const index = notes.findIndex((note) => note.id === seenId);
  return index === -1 ? notes.slice() : notes.slice(0, index);
}

/** Show the Home card for returning people only: a brand-new account sees the checklist instead. */
export function shouldShowWhatsNewCard({ seenId, isNewAccount = false, notes = RELEASE_NOTES } = {}) {
  if (isNewAccount) return false;
  return whatsNewSince(seenId, notes).length > 0;
}
