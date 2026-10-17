# Phase 2A.6-A product UI review

**Update:** The three findings below were addressed by the subsequent [Account Ops UI refresh](./ACCOUNT_OPS_UI_REFRESH.md), which passed 926 foundation browser assertions and the existing 20-fixture workflow suite. The original review is retained below for context.

Reviewed 2026-09-14 using the final synthetic browser captures and their matching component source. This is a visual and source review, not a new live-browser test run.

## Decision

The local foundation passed its technical validation, but three product usability gaps should be addressed before publishing a Preview for user review. The earlier completion report describes the implemented foundation and test results; it does not establish product acceptance.

## Findings

1. **P2 — Replace internal references with readable names.** Account creation cards display `retailer-preset:target`, `emailAliases:business-01`, and `profile:business-01`. Profile compatibility also displays retailer IDs. These references wrap awkwardly on phones and do not tell the owner which email/profile is assigned. Resolve them through the existing retailer, alias, and profile collections, with an explicit missing-reference fallback. Evidence: `AccountOpsOperationsPanel.jsx`, Accounts at line 75, and the Identity compatibility cards; `mobile-light-accounts.png` and `mobile-light-identity.png`.

2. **P2 — Make All Accounts reach the account list.** The button in Account Health Center calls `onNavigate("accounts")` while already inside the Accounts area. `chooseSection` resets the query/filters but supplies no list scroll or focus target. On mobile the actual Store Accounts list is several sections below. Give this action a list anchor with keyboard focus, or remove the redundant control. Evidence: `AccountOpsOperationsPanel.jsx:76` and `AccountOpsPage.jsx:262`.

3. **P2 — Provide a populated synthetic order demonstration.** The panel supports `operationsSnapshot`, including order relationship records, but AccountOpsPage never supplies that prop. The reviewed Orders screen therefore always shows the empty unified relationship view, even though the fixture library contains synthetic orders. Provide an explicitly labeled, isolated, read-only demo that shows order/shipment/receiving relationships without writing to owner records, and exercise it in the browser suite. Do not activate provider connections or duplicate Purchase/Receiving authority. Evidence: AccountOpsPage panel invocations, the optional `operationsSnapshot` prop, and `phone-dark-orders.png`.

## Additional polish

The layout and corrected light/dark colors are readable, and the mobile area picker keeps navigation compact. However, repeated engineering terms such as "projection", "authority", "schema", and "foundation" make the screens feel like implementation documentation. Prefer a concise "Demo / not connected" status and plain descriptions of what the owner can do. Keep detailed integration limits in expandable help where useful.

The narrow mobile Create Account Draft button wraps across three lines; place the primary action below the heading on small screens. Verification and export readiness are currently review-only, consistent with the local phase, and must not be presented as live actions.

## Scope and evidence

Reviewed Accounts, Verification, Identity, Automation, Orders, and Activity captures across light mobile and dark desktop/phone layouts under `artifacts/qa/code3-phase2a6a-account-ops-foundation/current/`. The previous completion report retains the 914-assertion browser and 28/28 regression evidence. Those checks do not test whether the All Accounts button reaches its intended list or whether synthetic order relationships are rendered in the composed page.

This review made no application-source, branch, commit, deployment, environment, or hosted-verification changes. Phase 2B2-B.1 remains paused.
