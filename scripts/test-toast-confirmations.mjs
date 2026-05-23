import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync("src/App.jsx", "utf8");
const css = fs.readFileSync("src/App.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(app, /function normalizeToastPayload/, "toast payload normalization should exist");
assert.match(app, /const showToast = useCallback/, "global showToast helper should exist");
assert.match(app, /const showSuccessToast = useCallback/, "success toast helper should exist");
assert.match(app, /const showErrorToast = useCallback/, "error toast helper should exist");
assert.match(app, /const showWarningToast = useCallback/, "warning toast helper should exist");
assert.match(app, /const showInfoToast = useCallback/, "info toast helper should exist");
assert.match(app, /const setVaultToast = useCallback/, "legacy toast calls should route through the global toast system");
assert.match(app, /renderToastViewport\(\)/, "toast viewport should render globally");
assert.match(app, /aria-live="polite"/, "toast viewport should announce changes accessibly");
assert.match(app, /role=\{type === "error" \? "alert" : "status"\}/, "error toasts should use alert role");
assert.match(app, /slice\(0, 3\)/, "visible toast stack should be capped");

assert.match(app, /const requestConfirmation = useCallback/, "global confirmation request helper should exist");
assert.match(app, /const confirmDestructive = useCallback/, "destructive confirmation helper should exist");
assert.match(app, /renderConfirmationModal\(\)/, "confirmation modal should render globally");
assert.match(app, /role="dialog"/, "confirmation modal should use dialog role");
assert.match(app, /aria-modal="true"/, "confirmation modal should be modal for assistive tech");
assert.match(app, /inventoryDeleteContext\(itemToDelete\)/, "item deletion should build a user-facing confirmation context");
assert.match(app, /confirmDestructive\(\{\s*title: deleteContext\.title/s, "item deletion should use a visible confirmation");
assert.match(app, /Delete sale\?/, "sale deletion should use a visible confirmation");
assert.match(app, /Delete expense\?/, "expense deletion should use a visible confirmation");
assert.match(app, /Revoke invite\?/, "invite revocation should use a visible confirmation");
assert.match(app, /Reset selected Drop Radar data\?/, "Drop Radar reset should use a visible confirmation");

assert.match(css, /\.app-toast-viewport/, "toast viewport CSS should exist");
assert.match(css, /bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\)/, "mobile toasts should sit above bottom nav and safe area");
assert.match(css, /\.app-toast--success/, "success toast styling should exist");
assert.match(css, /\.app-toast--error/, "error toast styling should exist");
assert.match(css, /\.app-confirmation-backdrop/, "confirmation backdrop CSS should exist");
assert.match(css, /\.app-confirmation-dialog--danger/, "destructive confirmation styling should exist");

assert.equal(
  pkg.scripts["test:toast-confirmations"],
  "node --no-warnings scripts/test-toast-confirmations.mjs",
  "package script should expose toast confirmation checks",
);

console.log("Toast and confirmation checks passed.");
