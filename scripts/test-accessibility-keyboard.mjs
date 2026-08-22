import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const operationsSource = fs.readFileSync(new URL("../src/components/operations/OperationsUI.jsx", import.meta.url), "utf8");
const ownerCenterSource = fs.readFileSync(new URL("../src/features/ownerCenter/OwnerCenterPage.jsx", import.meta.url), "utf8");
const ownerCenterCss = fs.readFileSync(new URL("../src/features/ownerCenter/owner-center.css", import.meta.url), "utf8");
const everydaySource = fs.readFileSync(new URL("../src/pages/EverydayWorkspaces.jsx", import.meta.url), "utf8");

function readCssGraph(url, seen = new Set()) {
  const key = url.href;
  if (seen.has(key)) return "";
  seen.add(key);

  const source = fs.readFileSync(url, "utf8");
  const imports = [...source.matchAll(/@import\s+["']([^"']+)["'];/g)]
    .map((match) => readCssGraph(new URL(match[1], url), seen));
  return `${imports.join("\n")}\n${source}`;
}

const cssSource = [
  fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8"),
  readCssGraph(new URL("../src/App.css", import.meta.url)),
].join("\n");

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

assert.match(appSource, /aria-label=\{`\$\{item\.label\}\. \$\{item\.helper \|\| "Open this workspace area\."\}`\}/);
assert.match(appSource, /aria-label="Scout screenshot or photo review\. Try text extraction, then review before saving a Scout report\."/);
assert.match(appSource, /aria-label="Scan page of cards\. Manual multi-card review\. Automatic card detection is not live yet\."/);
assert.match(appSource, /aria-label="Manual entry\. Add a record now and correct details before saving\."/);
assert.match(appSource, /aria-label=\{`\$\{mode\.title\}\. \$\{mode\.helper\} Coming later\.`\}/);
assert.match(operationsSource, /aria-label="Primary navigation"/);
assert.match(operationsSource, /aria-current=\{item\.key === activeKey && !item\.isAction \? "page"/);
assert.match(ownerCenterSource, /role="tablist" aria-label=\{label\}/);
assert.match(ownerCenterSource, /role="tab" aria-selected=\{active === item\.key\}/);
assert.match(ownerCenterSource, /<label className="owner-field">/);
assert.match(everydaySource, /role="tab"/);
assert.match(ownerCenterCss, /min-height: 44px/);
assert.match(ownerCenterCss, /@media \(max-width: 420px\)/);

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
