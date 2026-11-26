// Home opens on a few big choices (Nov 25 2026); the checklist, "Your shortcuts"
// and the business cards sit under "More", which is closed at first. Tests that
// check those sections add this as a page init script: it opens "More" the way a
// person would by tapping it. test-continuous-scan-browser.cjs checks that it
// starts closed.
module.exports = function openHomeMore() {
  const open = () => document.querySelectorAll("details.home-more:not([open])").forEach((details) => { details.open = true; });
  const start = () => { open(); new MutationObserver(open).observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
};
