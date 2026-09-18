import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/features/botOps/BotOperationsPage.jsx");
const component = read("src/features/botOps/importPreview/StellarTaskExportPreview.jsx");
const preview = read("src/features/botOps/importPreview/preview.js");
const styles = read("src/features/botOps/importPreview/stellar-task-export-preview.css");
const registry = read("src/features/botOps/providerRegistry.js");
const routes = read("src/config/workspaceRegistry.js");
const botIndex = read("src/features/botOps/index.js");

let assertions = 0;
function matches(value, pattern, message) { assert.match(value, pattern, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }

matches(page, /import StellarTaskExportPreview from "\.\/importPreview\/StellarTaskExportPreview\.jsx"/, "the preview is a dedicated Bot Operations feature boundary");
matches(page, /function TasksSection[\s\S]*<StellarTaskExportPreview \/>[\s\S]*title="Tasks"/, "the preview is placed in the existing owner-only Tasks section");
matches(page, /<StellarTaskExportPreview \/>/, "the preview receives no repository, persistence, import, or writer callback");
matches(page, /if \(!authorized\)[\s\S]*setService\(null\)[\s\S]*return undefined/, "the existing owner gate remains before Bot storage initialization");
matches(routes, /path:\s*"\/bot\/tasks"[\s\S]*requiredAuthority:\s*AUTHORITY_REQUIREMENTS\.VERIFIED_OWNER/, "the containing route remains verified-owner only");

matches(component, /eyebrow="Offline Preview"/, "the flow is explicitly labeled offline");
matches(component, /The published Stellar schema is not verified/, "the UI does not overclaim format compatibility");
matches(component, /type="file"[\s\S]*accept="\.json,application\/json"/, "the owner must explicitly select a JSON file");
matches(component, /aria-describedby="stellar-preview-help stellar-preview-limit"/, "file restrictions have accessible descriptions");
matches(component, /aria-label="Stellar task export offline preview"/, "the preview section has a resolvable accessible name");
matches(component, /disabled=\{busy\}/, "the file input cannot change during an active read");
matches(component, /aria-live="polite"/, "selection and lifecycle updates are announced");
matches(component, /role="alert"/, "safe read and security failures use alert semantics");
matches(component, /Preview File/, "the only primary mutation-like label is Preview File");
matches(component, /Discard/, "the owner can discard ephemeral state");
matches(component, /Choose another Stellar JSON file/, "the owner can replace the selected file explicitly");
matches(component, /Stellar Export Preview ≠ Bot Task Import · Previewed Task ≠ Task/, "the zero-import authority boundary is visible");
matches(component, /Nothing was imported or saved/, "result copy states the zero-write outcome");
matches(component, /Exported status · not live/, "exported status is not presented as runtime status");
matches(component, /Not verified provider coverage/, "retailer labels do not grant provider coverage");
matches(component, /Non-authoritative task preview/, "task preview rows cannot be mistaken for canonical tasks");
matches(component, /This file contains information that Code 3 does not allow/, "security failure copy is bounded and category-level");
matches(component, /selectedFileRef\.current = null/, "the raw File reference is explicitly released");
matches(component, /requestGenerationRef\.current \+= 1/, "stale asynchronous reads are invalidated");
matches(component, /setPreview\(null\)/, "discard clears normalized preview state");
matches(component, /fileInputRef\.current\.value = ""/, "discard clears the browser file input");

for (const forbiddenLabel of ["Import", "Save", "Create Tasks", "Apply", "Sync", "Connect", "Upload to Bot", "Send to Stellar"]) {
  excludes(component, new RegExp(`>\\s*${forbiddenLabel}\\s*<`, "i"), `${forbiddenLabel} must not be an action`);
}
excludes(component, /dangerouslySetInnerHTML|<pre\b|<code\b/, "the UI must not render raw JSON or untrusted HTML");
excludes(component, /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "the UI must not access persistence or network surfaces");
excludes(component, /createBotOpsService|createBotOpsRepository|createBotOpsPersistence|normalizeBotTask|createPurchase|receiveInventory|createInventory/, "the UI must not reach canonical writers");
excludes(preview, /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "the preview orchestrator remains storage- and network-free");
excludes(preview, /sourceFingerprint|rawFileHash|crypto\.subtle|createHash/, "the raw file is not retained through a fingerprint");
excludes(botIndex, /importPreview|phase2db2/i, "synthetic preview fixtures and test barrels must not enter the production Bot Operations module graph");

matches(styles, /min-height:\s*44px/, "preview controls meet the touch-target minimum");
matches(styles, /overflow-wrap:\s*anywhere/, "long filenames and identifiers wrap safely");
matches(styles, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/, "preview cards shrink within narrow layouts");
matches(styles, /@media \(max-width:\s*700px\)/, "mobile layout behavior is explicit");
matches(styles, /@media \(prefers-reduced-motion:\s*reduce\)/, "reduced motion is explicit");
matches(styles, /:focus-visible/, "preview controls expose visible keyboard focus");

matches(registry, /connectionStatus:\s*BOT_PROVIDER_CONNECTION_STATUS\.NOT_CONFIGURED/, "every generated provider definition remains not configured");
matches(registry, /\[BOT_PROVIDER_KEYS\.HAYHA\]:\s*providerDefinition\(BOT_PROVIDER_KEYS\.HAYHA,\s*"Hayha"\)/, "Hayha uses the fail-closed provider definition");
matches(registry, /\[BOT_PROVIDER_KEYS\.STELLAR\]:\s*providerDefinition\(BOT_PROVIDER_KEYS\.STELLAR,\s*"Stellar"\)/, "Stellar uses the fail-closed provider definition");
matches(registry, /capabilities:\s*DISABLED_CAPABILITIES/, "every provider receives the all-false capability map");
matches(registry, /networkAccess:\s*false/, "provider definitions retain disabled network access");
matches(registry, /configuredProviderCount:\s*0[\s\S]*liveCapabilityCount:\s*0[\s\S]*liveTaskCount:\s*0[\s\S]*providerNetworkAccess:\s*false/, "foundation status remains entirely offline");
excludes(registry, /providerNetworkAccess:\s*true|networkAccess:\s*true|live:\s*true/, "preview parsing must not activate provider capabilities");

console.log(`Code 3 Stellar export preview UI contract: ${assertions} assertions passed.`);
