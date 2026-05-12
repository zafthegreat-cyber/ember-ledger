# Ember & Tide TCG Product Vision

Ember & Tide TCG helps users know what they have, what it is worth, where to find more, what to buy, what to sell, what to grade, and what to share, all in one place.

The product combines the best parts of collection trackers, marketplaces, restock Discords, Facebook groups, TCGplayer-style pricing, grading tools, spreadsheets, and business inventory apps, but makes them cleaner, smarter, safer, and easier.

## Section Branding

This is the preferred user-facing branding direction. It does not rename routes, database objects, table names, migrations, RLS policies, or internal code names yet.

| Full page title | Short nav label | Former/current area | Includes |
| --- | --- | --- | --- |
| Tide Watch | Watch | Scout / restock intelligence | Drop Radar, store reports, Quick Report, calendar, predictions, and restock intel |
| Tide Vault | Vault | Vault / personal collection | Cards, sealed collection, wishlist, master set tracking, and owned items |
| Ember Exchange | Market | TideTradr / Market | Prices, deals, listings, market values, watchlist, and trade value |
| The Hearth | Hearth | Forge / business | Business inventory, sales, expenses, mileage, receipts, reports, and marketplace tools |
| Tidepool | Pool | Community | Posts, questions, sightings, events, replies, and confirmations |

## Product Promise

Ember & Tide should answer:

- What do I own?
- What is it worth?
- Is this the correct variant?
- Is it raw or graded?
- Should I grade it?
- Should I sell it?
- Should I open it?
- Should I keep it sealed?
- Is this a good deal?
- Where can I find it locally?
- Which store should I check?
- What should I list it for?
- What did I spend?
- What did I profit?
- What do I need for my set?
- What can I trade?
- What can I give away?
- What should I do next?

## Feature Priority Levels

### Core Beta Features

These features must feel stable before expanding into advanced AI, maps, or marketplace automation.

Core Beta:

- Sign-in and cloud/local status clarity.
- Vault basic collection tracking.
- Forge basic inventory and expenses.
- Receipt scan/review with manual verification.
- Search-first catalog lookup.
- Manual add.
- Scanner result destination choice.
- Wishlist basics.
- Import / Transfer Collection foundation.
- Bulk Add foundation.
- Deal Finder foundation.
- Scout basic store reports.
- Admin-reviewed store/catalog suggestions.
- Clean mobile navigation.
- Clear modal behavior.
- No auto-save before review.

Success criteria:

- User can add an item to Vault.
- User can add an item to Forge.
- User can scan/search and choose destination.
- User can review a receipt before saving.
- User can import/bulk add with review.
- User can submit a Scout report.
- User can tell what is cloud-synced vs local-only.
- App works well on iPhone and Android screen sizes.

### Differentiator Features

These are the features that make Ember & Tide feel meaningfully better than a spreadsheet, Discord, Facebook group, or simple collection tracker.

Differentiators:

- Vault and Forge separation.
- Exact card variant selection.
- Raw vs graded ownership tracking.
- Graded card metadata.
- Manual graded price support.
- Deal Finder buy/pass scoring.
- Scout store reports with confidence labels.
- Store pages.
- Scout mini map.
- Route planner.
- Trusted reporter system.
- Tidepool community boards.
- Kid Pack Builder.
- Trade calculator.
- Sealed vs rip calculator.
- Pull tracker.
- AI-assisted grade estimator.
- AI listing writer.

Success criteria:

- User can make better buying, selling, grading, trading, and scouting decisions inside the app.
- Community data is more structured and trustworthy than Discord/Facebook chatter.
- Inventory and business data are easier than spreadsheets.
- Collector features are deeper than basic portfolio trackers.

### Premium Features

These features are strong paid-tier candidates because they save time, improve decisions, or support business workflows.

Collector Plus:

- Unlimited Vault tracking.
- Set completion.
- Binder view.
- Price history.
- Variants.
- Graded/slab tracking.
- Grading candidates.
- Collection export.
- Insurance export.
- Chase card alerts.

Seller Pro:

- Forge advanced inventory.
- Sales tracking.
- Receipt scan/review.
- Profit/loss.
- Mileage.
- Deal Finder advanced.
- Marketplace drafts.
- CSV exports.
- Listing prep.
- Business reports.
- Partner/team ledger.

Scout Premium:

- Mini map.
- Route planner.
- Restock predictions.
- Store confidence scores.
- Advanced store history.
- Online watchlist.
- Wishlist alerts.
- Was-it-worth-the-drive reports.

Ultimate:

- Collector Plus + Seller Pro + Scout Premium.
- Shared workspace.
- Team permissions.
- Advanced AI tools.
- Advanced reports.
- Priority alerts.
- Export tools.

### Later / Advanced Features

These should not block beta.

Later features:

- Full AI provider integrations.
- Paid OCR/image recognition.
- Push/SMS/email alerts.
- Marketplace API publishing.
- Full cross-listing automation.
- Advanced map heat zones.
- Public collection profiles.
- Community reputation automation.
- Provider-backed graded market prices.
- Full online product monitoring.
- Team billing.
- Advanced analytics dashboards.

### Do Not Build / Avoid

Avoid these unless legal, provider, and platform rules clearly allow them:

- Auto-buy bots.
- Queue bypass tools.
- Unauthorized scraping.
- Frontend provider keys.
- Auto-publishing AI/community data without review.
- Treating guesses as confirmed reports.
- Saving imported/bulk/receipt items before review.
- Mixing raw, sealed, and graded prices without labels.

## North Star User Flows

### Collector Flow

Search or scan item -> choose exact variant -> choose raw or graded -> add to Vault -> track value -> see set progress -> decide whether to grade, trade, sell, or hold.

### Seller Flow

Scan receipt or bulk add items -> review matches -> send items to Forge -> track cost basis -> price inventory -> create marketplace drafts -> record sale -> see profit/loss.

### Scout Flow

Open Scout map -> check favorite stores -> view confidence and last reports -> plan route -> check store -> submit report -> update route value and mileage.

### Deal Finder Flow

Paste or scan deal -> match items -> compare MSRP/raw/graded market -> calculate risk and max buy price -> choose buy/maybe/pass -> add purchased items to Vault or Forge.

### Community Flow

User submits public, private, or team report -> app labels confidence -> admin/community review improves trust -> Tidepool summarizes useful activity without exposing private data.

### AI-Assisted Flow

User uploads, scans, or asks a question -> AI suggests match/price/grade/listing/report -> confidence is shown -> user accepts, edits, or rejects -> only verified data is saved.

## Immediate Engineering Focus

Current engineering focus should stay narrow:

1. Verify receipt save/reload.
2. Verify import/bulk add save/reload.
3. Clean dirty working tree.
4. Stabilize mobile add/search/scan flows.
5. Commit stable beta foundation.
6. Then start card variants and raw vs graded support.

Do not start broad AI, maps, paid provider integrations, or marketplace automation until the current foundation is stable.

## Main App Pillars

### 1. Vault

Personal collection tracking.

Vault covers:

- Raw cards
- Graded cards
- Sealed collection
- Variants
- Set completion
- Binder view
- Wishlist
- Chase cards
- Collection value
- Grading candidates
- Insurance export
- Collection reports

Vault should feel like a private, accurate home base for collectors. It should separate personal collection value from business inventory and prevent accidental mixing with Forge.

### 2. Forge

Business and seller tools.

Forge covers:

- Inventory
- Sales
- Expenses
- Mileage
- Receipts
- Marketplace drafts
- Profit/loss
- Planned sales
- Stale inventory
- Pricing suggestions
- Cross-listing prep
- Team/partner ledger

Forge should replace fragile spreadsheets and scattered seller notes. It should answer whether a purchase, listing, event, or route actually made money.

### 3. Scout

Restock intelligence.

Scout covers:

- Store mini map
- Store pages
- Restock reports
- Restock predictions
- Route planner
- Truck/restock history
- Online drop watch
- Wishlist alerts
- Confirmed vs guess labels
- Was-it-worth-the-drive tracking

Scout should make local restock information useful without turning guesses into false certainty. Confirmed reports, predictions, and rumors must be clearly labeled.

### 4. Tidepool

Community layer.

Tidepool covers:

- Local restock boards
- Trade/sell posts
- ISO posts
- Kids giveaway posts
- Trusted reporters
- Report confidence
- Local market board
- Polls
- Community summaries
- Admin moderation

Tidepool should provide the useful parts of Discord and Facebook groups while reducing noise, scams, stale posts, and unclear trust signals.

### 5. Catalog

Master Pokemon database.

Catalog covers:

- Cards
- Sealed products
- Variants
- UPC/SKU
- MSRP
- Raw market
- Graded market
- Product images
- Expansions
- Release dates
- Market links
- Admin correction tools

Catalog is universal data. Regular users can suggest additions and edits, but approved catalog/store changes require admin review.

### 6. Market / Deal Finder

Decision tools.

Market and Deal Finder cover:

- Buy/pass score
- MSRP vs market
- Percent of market
- Trade calculator
- Sealed vs rip calculator
- Pull tracker
- Chase card tracker
- Price memory
- Grading ROI
- Max buy price

These tools should turn scattered pricing data into a clear decision, while still showing assumptions and letting the user override them.

### 7. Ember AI

AI assistance across the app.

Ember AI covers:

- Photo/card/product identification
- Receipt extraction
- Grade estimator
- Listing writer
- Deal analysis
- Pricing suggestions
- Duplicate detection
- Restock summaries
- Collection reports
- Business insights

AI assists, but it does not silently decide. Every AI-created or AI-matched result should be reviewable before it becomes saved user data.

## Competitive Comparison

### TCGplayer

What it does well:

- Strong market pricing reference.
- Marketplace liquidity.
- Card and sealed product listings.
- Seller tools and buyer trust.

What it does not solve:

- Personal Vault and business Forge separation.
- Local restock intelligence.
- Receipt-based cost basis.
- Collection imports with review.
- Community/local reporting.
- Full workflow from finding, buying, tracking, selling, and reporting.

How Ember & Tide should do it better:

- Use TCGplayer-style market context without becoming only a marketplace.
- Connect pricing to ownership, cost basis, receipts, Scout reports, and Deal Finder decisions.
- Keep user verification and privacy central.

### Collectr

What it does well:

- Clean collection tracking.
- Portfolio-style value display.
- Easy collector onboarding.

What it does not solve:

- Seller-grade business inventory.
- Receipt workflows.
- Local restock reports.
- Route planning.
- Marketplace prep.
- Team/partner ledger.

How Ember & Tide should do it better:

- Match the simplicity of collection tracking while adding stronger business, restock, and decision tools.
- Separate personal collection from seller inventory clearly.

### PriceCharting

What it does well:

- Historical price context.
- Raw and graded price references.
- Broad collectibles coverage.

What it does not solve:

- Daily user workflows.
- Receipt extraction.
- Local finding/scouting.
- Marketplace draft preparation.
- Inventory operations.

How Ember & Tide should do it better:

- Use market history as one input, not the whole product.
- Help users decide whether to buy, hold, grade, sell, trade, or ignore.

### Discord

What it does well:

- Fast community updates.
- Local restock chatter.
- Social trust among known members.

What it does not solve:

- Structured reports.
- Reliable history.
- Searchable store pages.
- Confirmed vs guessed labels.
- Private collection/business workflows.

How Ember & Tide should do it better:

- Preserve speed and community signal, but structure reports by store, product, confidence, time, and source.
- Make rumors useful without making them look confirmed.

### Facebook Groups

What they do well:

- Local buy/sell/trade volume.
- Community discovery.
- Casual ISO and sale posts.

What they do not solve:

- Trust scoring.
- Inventory linkage.
- Marketplace draft hygiene.
- Pricing memory.
- Duplicate/stale listing control.

How Ember & Tide should do it better:

- Make local market posts structured, searchable, and tied to catalog items.
- Add moderation, trust signals, stale post handling, and safer workflows.

### eBay

What it does well:

- Huge buyer market.
- Sold comps.
- Marketplace reach.

What it does not solve:

- Personal inventory organization.
- Cost basis and profit tracking.
- Local restock intelligence.
- Multi-platform prep.
- Collection or grading decision support.

How Ember & Tide should do it better:

- Treat eBay as a market/output channel, not the center of the user workflow.
- Help users decide what to list and at what price before export.

### Whatnot

What it does well:

- Live selling.
- Community commerce.
- Fast movement of inventory.

What it does not solve:

- Inventory preparation.
- True profit tracking.
- Receipt and cost basis capture.
- Cross-listing state.
- Long-term collection intelligence.

How Ember & Tide should do it better:

- Prepare clean Whatnot-ready CSV/listing data.
- Track what moved, what did not, and whether the event was profitable.

### Spreadsheets

What they do well:

- Flexible.
- Familiar.
- Easy to export/import.
- Good for power users.

What they do not solve:

- Catalog matching.
- Mobile scanning.
- Duplicate prevention.
- Variant correctness.
- Receipt linking.
- Restock intelligence.
- Marketplace workflow.

How Ember & Tide should do it better:

- Keep spreadsheet-level transparency and exportability.
- Remove manual matching, formulas, and duplicate cleanup from the user’s daily work.

## Design Principles

- User verifies before saving.
- AI assists, but does not silently decide.
- Private data stays private.
- Public/community data is labeled clearly.
- Guesses are not treated as confirmed reports.
- Universal catalog/store data requires admin review.
- Mobile-first.
- Fast search.
- No `select=*` catalog scans.
- No unauthorized scraping.
- No auto-buy bot behavior.
- No provider keys in frontend.
- Basic flows must still work when advanced providers are unavailable.
- Local fallback must be clearly labeled.
- Cloud sync must be honest: do not show synced/submitted unless the save succeeds.

## MVP Beta Scope

Beta should focus on stable core workflows, not broad provider automation.

Beta scope:

- Cloud sign-in and local beta fallback.
- Vault personal collection basics.
- Forge inventory, expenses, and receipt draft foundations.
- Receipt scan/review flow with user verification before submit.
- Smart catalog search using lightweight indexed sources.
- Scanner/search/add destination selection.
- Wishlist basics.
- Deal Finder foundation.
- Marketplace draft and CSV export foundation.
- Kid Pack Builder foundation.
- Scout store reports and admin-reviewed suggestions.
- Paid tier/feature gate foundation without payments.
- Collection transfer/import and bulk add foundations.
- Clear mobile navigation and modal behavior.

Out of beta scope unless explicitly approved:

- Paid OCR/image AI provider connections.
- Stripe or live payments.
- Auto-buy bots.
- Unauthorized scraping.
- Full marketplace API publishing.
- Advanced prediction automation.
- Team billing.

## Post-Beta Scope

Post-beta should deepen accuracy, automation, collaboration, and monetization.

Post-beta scope:

- OCR/photo provider abstraction and provider-backed receipt/card/product identification.
- Raw vs graded tracking with grade, cert, grader, and slab metadata.
- Manual graded pricing and later provider-assisted graded market values.
- Grade estimator foundation.
- Scout mini map and store pages.
- Route planner and was-it-worth-the-drive reports.
- Trade calculator and sealed vs rip calculator.
- Tidepool boards with trusted reporter system.
- Paid-tier enforcement with real billing.
- Team/shared workspace.
- Marketplace draft editing, exports, and provider-specific listing prep.
- Advanced reports and exports.
- Push/SMS/email alerts after notification permission and provider review.

## Paid-Tier Opportunities

Free:

- Basic Vault.
- Basic catalog search.
- Manual add.
- Wishlist basics.
- Basic Scout reports.
- Basic marketplace draft.

Collector Plus:

- Unlimited Vault tracking.
- Set completion.
- Portfolio value.
- Price history.
- Wishlist alerts.
- Variants.
- Graded/slab tracking.
- Collection export.
- Insurance export.

Seller Pro:

- Forge inventory.
- Sales tracking.
- Expenses.
- Mileage.
- Receipt scan/review.
- Profit/loss.
- Deal Finder.
- Marketplace drafts.
- CSV exports.
- Listing prep.
- Business reports.

Scout Premium:

- Route planner.
- Restock predictions.
- Store confidence scores.
- Watchlist routes.
- Advanced store history.
- Alerts.
- Online monitor.

Ultimate:

- Collector Plus + Seller Pro + Scout Premium.
- Shared workspace/team access.
- Advanced reports.
- Priority alerts.
- Export tools.
- Partner/team ledger.

## Admin Tools Needed

- Catalog correction review.
- UPC/SKU/identifier review.
- Product image/source review.
- Store suggestion review.
- Retailer/store metadata management.
- Universal data audit log.
- Community report moderation.
- Tidepool post moderation.
- Trusted reporter management.
- Feature gate/user entitlement controls.
- Provider health/status dashboard.
- Backfill/import runbooks and status.

## Future Data And Provider Integrations

Potential integrations:

- Supabase for auth, database, storage, and RLS-backed user data.
- TCGplayer-style market data sources.
- PriceCharting-style raw/graded price references.
- eBay sold comps.
- Whatnot/listing export formats.
- OCR/photo AI provider for receipts and product/card identification.
- Push/SMS/email provider for alerts.
- Map/geocoding provider for Scout.
- Retailer product pages where authorized.
- CSV import/export for user-owned data portability.

Provider rules:

- No provider keys in frontend.
- No unauthorized scraping.
- No auto-buy behavior.
- User must verify provider/AI output before saving.
- Provider failures should degrade clearly, not silently corrupt data.

## Major Risks

- Catalog accuracy: wrong variants, UPCs, or product matches can damage trust.
- Market price ambiguity: raw, graded, sealed, and variant prices must not be blended casually.
- AI overconfidence: AI matches must be labeled and reviewable.
- Privacy: collection value, receipts, locations, and business data are sensitive.
- Community trust: restock reports and guesses must be separated clearly.
- Mobile complexity: too many tools can overwhelm small screens.
- Scope creep: provider integrations can distract from stable manual workflows.
- Legal/platform risk: scraping, marketplace automation, and auto-buy behavior must be avoided.
- Data migration risk: schema changes should remain reviewed, idempotent, and safe.
- Performance: catalog search must stay lightweight, indexed, and limited.

## Recommended Build Order

1. Stabilize receipt save/reload and import/bulk add foundations.
2. Finish clean mobile add/search/scan flows.
3. Add card variants and raw vs graded support.
4. Add manual graded pricing and grade estimator foundation.
5. Add Scout mini map and store pages.
6. Add Deal Finder and trade calculator.
7. Add AI-assisted scanner/receipt/grade/listing tools.
8. Add Tidepool community boards and trusted reporter system.
9. Add paid-tier enforcement.
10. Add team/shared workspace.
11. Add marketplace drafts/cross-listing.
12. Add advanced reports and exports.

## Architecture Direction

### Data Ownership

User-owned data:

- Vault items.
- Forge inventory.
- Sales, expenses, mileage, receipts.
- Wishlist.
- Deal Finder sessions.
- Marketplace drafts.
- Kid Pack Builder projects.
- Notification preferences.
- Import/bulk add drafts.

Universal/admin-controlled data:

- Master catalog items.
- Variants.
- UPC/SKU identifiers.
- Expansions.
- Store list.
- Retailer metadata.
- Tracked SKU templates.
- Product corrections.

Community data:

- Scout reports.
- Tidepool posts.
- Trade/sell/ISO/kids giveaway posts.
- Polls.
- Public local summaries.

Universal and community data should be clearly labeled so users understand what is private, shared, guessed, confirmed, or admin-approved.

### Workflow Pattern

Core workflow pattern:

```text
Input -> Parse -> Match -> Review -> Choose destination -> Confirm -> Save -> Report
```

This applies to:

- Receipt scan.
- Scanner lookup.
- Manual add.
- Bulk add.
- Collection import.
- Marketplace listing prep.
- Scout report submission.
- Tidepool posts.

The app should avoid hidden writes. Review screens should show what will happen before data is saved.

### Search Architecture

Search should use:

- Exact identifier lookup first.
- Prefix/name search second.
- Fuzzy search only when needed.
- Lightweight indexed catalog views for result lists.
- Detail loading only after the user opens a result.
- Client cache and request cancellation.

Search should avoid:

- `select=*` result payloads.
- Browser-side filtering of huge catalog sets.
- Raw catalog scans during normal UI search.
- Repeated broad network requests per keystroke.

### AI Architecture

AI should be added through provider abstractions, not hardwired into UI flows.

Suggested AI service boundaries:

- Receipt extraction.
- Product/card identification.
- Grade estimation.
- Listing copy generation.
- Deal explanation.
- Duplicate detection.
- Report summarization.

Each AI result should include:

- Source input.
- Suggested output.
- Confidence.
- Warnings.
- User-verification state.
- Audit metadata.

### Security And Privacy

Security rules:

- Use RLS for user-owned data.
- Team data requires explicit workspace/team permissions.
- Admins can moderate universal/community data, but should not casually access private receipt/business details.
- Provider credentials stay server-side.
- No service role keys in frontend.
- No secret-bearing logs or artifacts in commits.
- Submitted receipts and inventory changes should be auditable.

### Reporting

Reports should be generated from verified data only.

Report types:

- Collection value report.
- Insurance export.
- Forge profit/loss report.
- Receipt report.
- Marketplace export report.
- Scout route report.
- Store confidence report.
- Community contribution summary.
- Grading candidate report.

Reports should distinguish:

- Actual spend.
- Estimated market value.
- MSRP.
- Raw value.
- Graded estimate.
- Confirmed sale price.
- Predicted/AI-assisted values.
