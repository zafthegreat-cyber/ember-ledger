# Code 3 TCG Buy Offer calculator

September 24, 2026. Added a local Buy Offer tool at **Find → More → Buy Offer**, with a second entry on Find Home and a direct route at `/find/buy-offer`. This follows [WORKSPACE_KEYBOARD_REPORT.md](./WORKSPACE_KEYBOARD_REPORT.md). The checkout remains detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`, associated with `origin/ui-104-final-product-ui-2`. Existing uncommitted work was preserved; nothing was committed, pushed, merged or deployed.

## What it does

- Calculates an **opening offer, target offer and offer ceiling**, with the target explicitly shown as a **percentage of market value** and, when provided, of the seller's asking price.
- Supports **resale and personal collection** modes, sealed products, singles, graded cards, lots and supplies.
- Uses entered market value, relevant MSRP, product type, availability and demand. These are manual observations, not live lookups. Market input should match the item's condition, language and edition. Enter one item's prices or one complete lot's totals consistently.
- For resale, limits the offer using entered selling fees, selling costs, buying costs and minimum profit. Collection mode ignores retained resale-only inputs and subtracts buying costs from its ceiling.
- Uses MSRP as a reference cap only for sealed products or supplies explicitly **available to buy at MSRP**. Otherwise MSRP is context; it is not applied to singles, graded cards or lots. An entered asking price can only lower an offer.
- Shows the assumptions and limits. Unknown availability/demand receive visible cautious adjustments. Zero-cost resale estimates explicitly warn that no fee/cost allowance is entered.
- Preserves an allowlisted draft in the **current browser tab's session storage**. Editing clears the previous result. Reload and Back/Forward retain inputs; Reset requires confirmation. Missing or denied storage leaves the calculator usable with a visible message.

This tool is separate from Deal Analysis and its verified-evidence/history workflows. It does not send an offer, purchase an item, alter inventory, save an appraisal, fetch provider data or change authentication/permissions. USD is the only supported currency in this version. No database model or backend integration was added.

## Calculation policy

The default percentages below are **planning assumptions**, not researched industry buy rates or guarantees. The user can edit the starting percentage. The fixed category adjustments are visible in the calculation breakdown.

| Input | Adjustment |
| --- | --- |
| Starting percentage | 70% resale; 85% collection |
| Product type | Sealed +5 points; single 0; graded −5; lot −15; supplies −10 |
| Availability | Buyable at MSRP/easy to find −5; limited 0; hard to find +3; unknown −5 |
| Demand | Low −10; steady 0; high +5; unknown −5 |
| Adjusted policy bounds | 10–95% resale; 10–100% collection |

The pricing reference is market value, or the lower of market and MSRP when the explicit MSRP availability condition applies. The negotiation ceiling is reference × (adjusted percentage + 5 points, capped at 100%). The final ceiling is the lowest of that value, the available budget after costs/profit, and any seller asking price. The target is reference × adjusted percentage, capped by the final ceiling. The opening offer is 95% of that target.

Resale budget = market − selling fees − other selling costs − buying costs − minimum profit. Collection budget = pricing reference − buying costs. Negative budgets become zero and display a blocked state rather than an actionable offer. All calculations use integer cents and BigInt intermediates; selling fees round up, offers round down. Invalid formats, negative amounts, excess precision, unsupported choices and unsafe ranges do not produce a result.

Example: sealed product, $100 market, hard to find, high demand, default 70% resale starting percentage. Before costs, the policy target is 83%. With 15% selling fees, $5 selling costs and $10 minimum profit, the cost ceiling binds: **$66.50 opening, $70 target, $70 ceiling**, with $10 projected profit at the entered resale value and costs. This is a synthetic calculation, not a product quote.

The input guidance follows the distinction between completed sale prices and listed prices in [TCGplayer's price definitions](https://help.tcgplayer.com/hc/en-us/articles/222376867-What-do-the-different-price-points-on-TCGplayer-com-mean) and [eBay's pricing guidance](https://ocsnext.ebay.com/help/selling/selling/pricing-items?id=4133), reviewed September 24, 2026. Neither source supplies the calculator's percentage policy.

## Verification

Evidence is under [`artifacts/qa/buy-offer`](../artifacts/qa/buy-offer/). The [combined verification record](../artifacts/qa/buy-offer/verification.json) records the source and actual results.

| Check | Actual result |
| --- | --- |
| Calculation domain | **23/23** checks passed, including **880** combinations, exact-cent rounding, all adjustments, MSRP/asking caps, cost monotonicity, invalid/large inputs, blocked results and collection-mode isolation. |
| New route contracts | **14/14**, direct URL, query/trailing-slash handling, route round trips, Find ownership, legacy aliases and unknown-tool fallback. |
| New actual-app browser journeys | **4/4**, light/dark at 360/1440 px; eleven behavior groups per context. |
| Browser coverage | Arithmetic examples, invalid/error focus, hidden settings, cost/MSRP/asking caps, changed-input invalidation, default/custom percentages, reload, Back/Forward, Find entries, reset confirmation, corrupt/object drafts, storage denial, 44 px targets, no horizontal overflow and zero runtime errors. Calculator operations leave existing business/collection data unchanged. |
| Independent focus proof | **2/2**, normal React and StrictMode. Updated result/error text is committed before focus; invalid hidden settings open before focus. |
| Existing Flip Scout and valuation | Existing calculation/allocation/validation/storage/CSV suite passed; intelligence domain **168 assertions** passed. |
| Existing route/workspace contracts | Route compatibility **49** checks; workspace fixtures **20/20 / 117 assertions**; workspace UI **87 assertions**; route loading **32/32**; accessibility and menu contracts passed. |
| Production build | Passed. New lazy BuyOfferScreen chunk **15.67 kB / 5.62 kB gzip**; CSS **4.77 kB / 1.32 kB gzip**. Main App **1,919.45 kB / 509.52 kB gzip**; existing large-chunk warning remains. |
| Source lint | **336 files, 0 errors, 0 warnings**; lint-configuration check and scoped new-test lint passed. |
| Backend TypeScript | Passed. Frontend is JavaScript with no separate configured type-check script. |
| Broad browser/theme regressions | **28/28** regression scenarios and **30/30** theme/viewport/route checks passed. |
| Whitespace | `git diff --check` passed. |

The [final source manifest](../artifacts/qa/buy-offer/source-final.json) covers **518 files**, SHA-256 `732933b18ca26474c24e8b1b93b82517a128ef032f9946dfe5313c6a0372a024`. Runtime/build inputs were unchanged during final build and browser checks. The earlier completed manifest is retained separately for comparison; it is not presented as a fresh pre-edit capture. The manifest includes inherited work, not exclusive authorship.

## Screenshots and review

- [Desktop light offer with costs](../artifacts/qa/buy-offer/browser/buy-offer-example-light-1440.png)
- [Mobile dark offer result](../artifacts/qa/buy-offer/browser/buy-offer-example-dark-360-result.png)
- [Mobile light long-title stress test](../artifacts/qa/buy-offer/browser/buy-offer-light-360.png)
- [Unavailable draft storage](../artifacts/qa/buy-offer/browser/storage-unavailable-light-360.png)

Local preview: `http://127.0.0.1:5217/find/buy-offer?betaLocalMode=true`.

The first browser probe found the old dev server had stopped. That probe remains in `browser-probe-1`; the restarted preview passed a fresh full-app smoke check. Independent review found focus initially arrived before new results/errors were committed. The initial `independent/focus-proof.json` is preserved; the passing fix is `independent/focus-fixed.json`. Final full-app proof is `browser/results.json`. No historical proof directory was overwritten.

This is a locally verified feature, not a deployed release or a live pricing service. Physical devices and screen readers were not tested. The existing [private-beta acceptance gates](./PRIVATE_BETA_ACCEPTANCE.md) remain open; no hosted service, owner recovery, provider execution or real-data cutover was performed.
