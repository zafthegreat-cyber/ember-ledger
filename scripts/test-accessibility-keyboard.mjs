import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const cssSource = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

assert.match(cssSource, /Accessibility final layer: keyboard focus, tap comfort, and reduced motion\./);
assert.match(cssSource, /:focus-visible/);
assert.match(cssSource, /\.menu-command-link/);
assert.match(cssSource, /\.collector-showcase-card/);
assert.match(cssSource, /\.collector-flip-card > summary/);
assert.match(cssSource, /\[role="button"\]/);
assert.match(cssSource, /outline: 3px solid/);
assert.match(cssSource, /min-height: 44px/);

const reducedMotionStart = cssSource.lastIndexOf("@media (prefers-reduced-motion: reduce)");
assert.ok(reducedMotionStart > 0, "Reduced-motion media query should exist.");
const reducedMotionSource = cssSource.slice(reducedMotionStart);
assert.match(reducedMotionSource, /scroll-behavior: auto/);
assert.match(reducedMotionSource, /transition-duration: 0\.001ms/);
assert.match(reducedMotionSource, /animation-duration: 0\.001ms/);
assert.match(reducedMotionSource, /collector-showcase-shine/);
assert.match(reducedMotionSource, /hearth-skeleton-card/);
assert.match(reducedMotionSource, /transform: none !important/);

assert.match(appSource, /aria-label=\{`\$\{item\.label\}\. \$\{item\.helper \|\| "Open this Ember & Tide area\."\}`\}/);
assert.match(appSource, /aria-label="Scout screenshot or photo review\. Try text extraction, then review before saving a Scout report\."/);
assert.match(appSource, /aria-label="Scan page of cards\. Manual multi-card review\. Automatic card detection is not live yet\."/);
assert.match(appSource, /aria-label="Manual entry\. Add a record now and correct details before saving\."/);
assert.match(appSource, /aria-label=\{`\$\{mode\.title\}\. \$\{mode\.helper\} Coming later\.`\}/);

assert.match(appSource, /role="status" aria-live="polite" aria-label=\{`Grade Assist readiness status: \$\{gradeAssistReadiness\.label\}`\}/);
assert.match(appSource, /aria-label=\{`Grade Assist \$\{field\.label\}`\}/);
assert.match(appSource, /aria-label="Grade Assist Notes"/);
assert.match(appSource, /alt=\{`\$\{item\.name \|\| "Vault item"\} front reference for Grade Assist`\}/);
assert.match(appSource, /No AI, camera, OCR, authentication, or grading-company guarantee/);
assert.match(appSource, /Checklist storage is local to this browser for now\. Cloud sync needs backend Grade Assist storage\./);

const unsafeClaimPhrases = [
  "AI is live",
  "automatic AI assistant",
  "live pricing guarantee",
  "guaranteed grade",
  "authenticated by Ember",
  "verified seller enabled",
  "payment processed",
  "checkout connected",
  "tax receipt generated",
];
for (const phrase of unsafeClaimPhrases) {
  const matches = appSource
    .split(/\r?\n/)
    .filter((line) => line.toLowerCase().includes(phrase.toLowerCase()))
    .filter((line) => !/\b(no|not|without|does not|is not)\b/i.test(line));
  assert.deepEqual(matches, [], `Unsafe positive claim found for: ${phrase}`);
}

console.log("Accessibility keyboard and reduced-motion checks passed.");
