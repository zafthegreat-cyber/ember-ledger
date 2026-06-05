# Free Feature Parity

## Result

Free is intended to feel like a complete core collector app, not a crippled demo. The audit confirms the public plan model and Membership UI now state that paid tiers add scale, convenience, family seats, seller workflows, shop tooling, or admin review surfaces. Core collecting, basic fair-value review, Scout contribution, safety, and discovery remain included.

## Free Includes

- Create a collection.
- Add cards manually.
- Add sealed products manually.
- Add graded cards manually.
- Track raw, graded, and sealed items.
- Owned count, condition, variant, card number, set, notes, and duplicates.
- Folders, binders, tags, wishlist, favorites, missing cards, and set completion.
- Recent additions, collection value summary, and collection stats.
- Card search, product search, set browsing, card detail, and sealed product detail.
- Basic fair value estimate, fair range, source/freshness label, item-level value, and collection total value.
- Basic single-card scan entry point and manual correction/review placeholder.
- Export collection to CSV/text placeholder and import list placeholder.
- Share collection/list/wishlist with privacy controls.
- Basic wishlist alerts placeholder.
- Basic trade analyzer and parent approval warning for kid trades.
- Basic deck/list builder and basic Forge ledger.
- Market search/detail.
- One watched Scout store.
- Current nearby Scout signals.
- Manual Scout reports.
- Screenshot scan flow UI.
- Proof review UI.
- Confidence and Worth the Trip display.
- Tidepool read/report.
- The Spark view and donation-interest UI.
- Ember Assist basic prompts.
- Basic child privacy and safety copy.

## Paid May Unlock

- More watched Scout stores.
- More product watches.
- Faster or more advanced alerts.
- Advanced market alerts and deeper price history.
- Batch or binder scanning when available.
- Advanced Vault analytics.
- Multiple family collection spaces.
- More kid profiles.
- Parent approval queues.
- Trusted adult controls.
- Advanced Forge seller tools.
- Business reports and exports.
- Shop profile/tools.
- Sponsorship tools.
- Admin workflows.

## Must Not Be Paywalled

The UI and plan copy must not imply payment is required for:

- Basic collection tracking.
- Basic manual add.
- Basic search.
- Basic fair value.
- Wishlist and missing cards.
- Basic trade analyzer.
- Basic market search.
- Basic child safety.
- Basic Scout report submission.

## Membership Audit

- `src/services/featureGates.js` now describes Free as a complete core collector plan and lists manual card/sealed/graded tracking, folders/tags/wishlist/missing cards/set progress, basic fair value, basic trade analyzer, deck/list builder, Forge ledger, Scout report submission, screenshot scan UI, Tidepool read/report, The Spark view, Ember Assist prompts, and safety basics.
- `src/App.jsx` now shows a dedicated "Free is the core collector app" Membership section so the UI does not suggest core collector tools are paid.
- Checkout remains labeled as not live, and beta upgrades remain admin-managed.

## Scout Safety Result

Scout copy and tier language continue to protect the mission:

- Current reports and selected-store details are allowed.
- Raw history and pattern tools stay protected.
- Exact restock patterns, vendor schedules, employee schedules, auto-checkout, and all-store exact access are not exposed.
- Free users can still submit and confirm Scout reports.

## QA Evidence

- Screenshot folder: `artifacts/qa/free-feature-parity-and-source-of-truth/`
- Result file: `artifacts/qa/free-feature-parity-and-source-of-truth/source-truth-qa-results.json`
- Membership, Scout, Vault, Market, Parent Center, Tidepool, The Spark, Forge, Shop Portal, Admin Review, onboarding, and `screen-set.html` were sampled at 390x844, 430x932, and 1440x900.
- Result: 60 captures, 0 failures. The first sandbox run hit Chromium `spawn EPERM`; the outside-sandbox rerun passed.
- Build and targeted checks passed. Browser tests that hit sandbox Chromium `spawn EPERM` were rerun outside the sandbox and passed; one outside-sandbox Spark app-load timeout passed on immediate rerun.

## Mock/Local Boundary

This audit did not add backend writes, auth changes, billing, database schema changes, RLS changes, scraping, checkout, payments, uploads, messaging, live AI, or live inventory integrations. Plan and Membership changes are frontend copy/model clarification only.

## Next Recommendation

Run final pre-preview-deploy review, then push/deploy only after explicit approval.
