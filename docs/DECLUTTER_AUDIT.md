# Declutter and Information-Density Audit

## Scope and measurement

This audit covers the 17 requested everyday and owner screens at 360 × 800 pixels. The baseline is the clean verified commit `5ba662780b547508f3a7b8f6aa8add1c49a96325`; the after state is the uncommitted subtraction pass based on that commit. Both states were loaded with the same honest, device-local QA records. The temporary baseline worktree was kept clean and removed after capture.

Classifications are applied to every visible element pattern, including each repeated row/card pattern and the fields/actions inside it:

- `KEEP`: required to understand the page or take its primary next step.
- `COLLAPSE`: retained behind a native disclosure, filter sheet, or expandable detail.
- `MOVE_TO_DETAIL`: retained in the existing record-detail workflow.
- `MOVE_TO_OWNER_CENTER`: retained in the existing owner-only workspace.
- `MOVE_TO_MORE_MENU`: retained behind a compact More control.
- `REMOVE`: redundant presentation removed; no stored record or business behavior removed.
- `DUPLICATE`: repeated information or action removed from this location while the canonical version remains.

An “interface unit” in the disposition table is one labeled control, summary value, helper block, repeated record-row field, card fact group, or section. This count answers whether baseline elements were removed or hidden. The automated table later in this document separately counts DOM sections, cards, buttons, badges, and rendered text lines intersecting the first viewport.

## Global shell and density rules

| Visible element pattern | Classification | Result and reason it deserves initial space |
| --- | --- | --- |
| Product mark and workspace identity | KEEP | Provides orientation without repeating a promotional page title. |
| Desktop Home, Find, Collection, Business navigation | KEEP | These are the four canonical everyday workspaces. |
| Desktop Owner Center and Settings links | KEEP | Owner Center remains visibly owner-only; Settings remains a secondary utility. |
| Mobile Home, Find, Add, Collection, Business navigation | KEEP | Preserves the established five-target, thumb-reachable shell. |
| Header Assistant, profile, Add, notifications | KEEP | Existing global utilities remain available; only Add is visually dominant. |
| Repeated page-level Back to Home buttons | DUPLICATE | Removed where shell navigation already supplies the same exit. |
| Device-local status badge on routine screens | REMOVE | Storage behavior is unchanged; the badge did not help the immediate task. |
| Routine introductory paragraphs | REMOVE | Accessible names remain; explanations no longer precede ordinary lists and forms. |
| More than three visible tabs | MOVE_TO_MORE_MENU | The first three destinations remain; less-frequent destinations use More. |
| Provider health, import statistics, connection setup, and technical source explanations | MOVE_TO_OWNER_CENTER | Technical sourcing state belongs in the owner-only workspace. |
| Decorative gradients, stacked shadows, card-within-card treatment | REMOVE | Replaced with restrained surfaces, dividers, and one accent. |
| Visible status icon beside equivalent status text | DUPLICATE | Text is sufficient; status color is reserved for actual status. |
| Accessible labels and focus behavior | KEEP | Removed helper copy is retained in labels where it disambiguates an action. |

## Screen-by-screen element inventory

### 1. Home

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| “Today” eyebrow, greeting, introductory paragraph | KEEP / REMOVE | Greeting remains under the shorter “Home” label; paragraph removed. |
| Profile and Add actions | DUPLICATE / KEEP | Profile remains in the shell; Add is the only page primary action. |
| Needs Attention eyebrow, long title, and helper copy | REMOVE | One short `Needs Attention` heading remains. |
| Up to eight attention rows with count, title, explanation, and chevron | KEEP / REMOVE | Maximum five rows; count, title, and chevron remain. Explanations move to accessible labels. |
| Multiple strong-opportunity cards | REMOVE | Exactly one best opportunity is shown. |
| Opportunity status badge and separate confidence/risk controls | REMOVE / COLLAPSE | One plain confidence/risk line remains; status details stay in Find. |
| Opportunity price, projected profit, review action | KEEP / DUPLICATE | Price and one projected-profit value remain. The card opens through Find; redundant Review is removed. |
| Today section, budget panel, four quick actions, deadline cards | DUPLICATE / MOVE_TO_DETAIL | Add owns creation actions; auction deadlines remain in Needs Attention and Auctions. |
| Four large Business Snapshot metric cards and explanatory copy | COLLAPSE | Replaced by one optional, four-value summary strip. |
| Projected-versus-actual action | MOVE_TO_DETAIL | Existing detailed results remain in Business/Reports. |
| Recent Activity heading and six detailed rows | KEEP / REMOVE | Maximum five rows; title and date remain, details stay in accessible labels and record history. |
| Empty cards announcing absent sections | REMOVE | A one-line honest empty state replaces an empty container. |

Why retained elements deserve initial space: they answer only three questions—what needs action, what is the best current opportunity, and what changed recently. The optional strip supplies four business totals without creating another dashboard.

### 2. Find

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Private-sourcing eyebrow, Find title, long explanation | KEEP / REMOVE | Short “Sourcing / Find” heading remains. |
| Back to Home and device-local badge | DUPLICATE / REMOVE | Shell navigation replaces both. |
| Deals, Restocks, Auctions, Saved tabs | KEEP / MOVE_TO_MORE_MENU | First three stay visible; Saved moves to More. |
| Scan Listing, Deal Analysis, eBay Search, Sources action strip | DUPLICATE / MOVE_TO_MORE_MENU / MOVE_TO_OWNER_CENTER | Scan is in Add; Deal Analysis and eBay Search move to More; Sources moves to Owner Center. |
| Search field | KEEP | It is the fastest way to narrow the current feed. |
| Status, sort, and secondary filters exposed simultaneously | COLLAPSE | One Filter disclosure contains them. |
| Active secondary-screen title | KEEP | A compact context bar appears only on a secondary Find screen. |

Why retained elements deserve initial space: Find exposes the three high-frequency sourcing modes, one query, one filter control, and the current feed. Advanced configuration no longer competes with discovery.

### 3. Deals / Deal Feed

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Section eyebrow, title, helper paragraph | KEEP / REMOVE | Only the short `Deal Feed` title remains. |
| Search and full filter row | KEEP / COLLAPSE | Search remains; filters and sort share one disclosure. |
| Listing image, title, source | KEEP | These identify the opportunity. |
| Asking price/current bid | KEEP | This is the immediate acquisition signal. |
| Shipping, landed cost, resale range, profit, and ROI together | MOVE_TO_DETAIL | Only one projected-profit value or `Needs analysis` stays on the card. |
| Separate confidence and risk indicators | COLLAPSE | Combined into one concise signal line. |
| Listing age/time remaining | KEEP | Time determines review urgency. |
| Review, Open Listing, Save, Pass actions | KEEP / MOVE_TO_DETAIL | Review remains; Open, Watch/Save, and Pass are in detail. |
| Provider and normalization explanations | MOVE_TO_OWNER_CENTER | Technical sourcing context remains in owner-only source screens. |

Why retained elements deserve initial space: each card now contains only enough information to decide whether to open it; no financial claim is added or inferred.

### 4. Restocks

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Find navigation and Restocks destination | KEEP | Preserves the canonical discovery path. |
| Saved and advanced Find actions | MOVE_TO_MORE_MENU | Shared Find treatment. |
| Restock heading and current real-data state | KEEP | Shows whether any observation actually exists. |
| Store/report technical explanation | MOVE_TO_OWNER_CENTER | Detailed history, prediction support, and controls remain under Owner Center → Restocks. |
| Multiple empty informational containers | REMOVE | One concise honest state remains. |
| Add/report actions duplicated outside Add | DUPLICATE | Global Add remains the creation entry. |

Why retained elements deserve initial space: the landing page communicates only actionable restock information; probability/history detail remains owner-only.

### 5. Auctions

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Find navigation and Auctions destination | KEEP | Auctions remains a primary Find mode. |
| Saved and advanced Find actions | MOVE_TO_MORE_MENU | Shared Find treatment. |
| Auction title, source, current bid, ending state | KEEP | These determine review priority. |
| Full fee, tax, travel, labor, disposal, and bid calculation | MOVE_TO_DETAIL | Existing calculator and record detail remain unchanged. |
| Risk explanation and long notes | MOVE_TO_DETAIL | Risk state can surface; reasons remain expandable in detail. |
| Add Auction duplicated in page chrome | DUPLICATE | Global Add and the existing detailed flow remain canonical. |
| Capability/status legend | MOVE_TO_OWNER_CENTER | Source capability belongs in Owner Center → Sourcing → Auctions. |

Why retained elements deserve initial space: the feed shows urgency and current bid; detailed bid assumptions remain available without crowding discovery.

### 6. Collection

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Collection heading and Add Item | KEEP | Identifies the workspace and supplies its dominant action. |
| My Collection, Sets & Binders, Wishlist, Grading tabs | KEEP / MOVE_TO_MORE_MENU | My Collection remains; the other three move to More. |
| Collection count, allocated cost, projected value, migration counts | KEEP / REMOVE | Only item count and allocated cost remain as compact values. |
| Search | KEEP | Required to find an owned item quickly. |
| Filter state exposed as extra controls | COLLAPSE | One Filter control opens search/condition filtering. |
| Purpose-migration warning repeated with records | COLLAPSE | One review-queue entry appears only when unmatched records exist. |
| Image, item title, set/classification | KEEP | Minimum identification fields. |
| Purpose badge, full acquisition data, resale assumptions, location, notes | MOVE_TO_DETAIL | Preserved in the item detail record. |
| Sell This Item on every card | MOVE_TO_DETAIL | Purpose-changing action remains on the item detail screen. |
| View Details | KEEP | Single card action. |

Why retained elements deserve initial space: Collection now supports find, filter, recognize, and open. Cost/history is never discarded; it is simply disclosed in detail.

### 7. Collection item detail

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Back, item title, purpose/status | KEEP | Provides context and a safe return path. |
| Identification and acquisition summary | KEEP | These are core ownership facts. |
| Full source, cost, image, notes, storage, grading, and history fields | COLLAPSE | Grouped under expandable detail sections. |
| Repeated purpose/cost summary in multiple sections | DUPLICATE | Each fact has one canonical location. |
| Audit history | COLLAPSE | Preserved but not expanded initially. |
| Sell This Item / move-to-resale action | KEEP | This is the detail screen’s purpose-changing primary decision. |
| Secondary edit/delete actions | COLLAPSE | Remain behind the established action treatment and confirmation. |

Why retained elements deserve initial space: title, purpose, ownership facts, and the one consequential action are sufficient before expanding history or metadata.

### 8. Business

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Purchases, Inventory, Sales, Money top tabs | KEEP | Recast as four clear destination tiles. |
| Purchases content automatically rendered on `/business` | DUPLICATE | `/business` is now a true overview; `/business/purchases` keeps the workflow. |
| Metric row and purchase list on the landing route | MOVE_TO_DETAIL | Detailed records remain in their destination. |
| Multiple actions for adding business records | DUPLICATE | Global Add owns creation; destinations own record-specific actions. |
| Needs Attention | KEEP | Appears as one compact list only when real gaps exist. |
| Empty Needs Attention panel | REMOVE | Does not consume space when there is nothing to resolve. |

Why retained elements deserve initial space: the landing screen answers only where to go; exceptions appear below only when actionable.

### 9. Purchases

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Persistent Business destination tabs | DUPLICATE | Replaced by one `Back to Business` control on detail destinations. |
| Purchases heading and Record Purchase | KEEP | Defines the workflow and its primary action. |
| Purchase count and total cost | KEEP | Two compact figures summarize the current list. |
| Search/filter controls | COLLAPSE | Existing filtering remains in one control. |
| Record title, source/date, total cost, status | KEEP | Required to identify and prioritize a purchase. |
| Lot allocations, receipts, notes, all timestamps | MOVE_TO_DETAIL | Preserved in purchase/lot detail. |
| Multiple card actions | MOVE_TO_DETAIL | One open action leads to canonical controls. |

Why retained elements deserve initial space: purchases can be recognized and opened; allocation and documentation work occurs in detail.

### 10. Inventory

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Persistent Business destination tabs | DUPLICATE | Replaced by Back to Business. |
| Inventory heading and Add Inventory | KEEP | Identifies the list and its primary action. |
| Item count and allocated cost | KEEP | Maximum two summary figures. |
| Search/filter controls | COLLAPSE | One filter/search surface remains. |
| Image/title, quantity, status, allocated cost | KEEP | Minimum operational identity and cost. |
| Projected range, storage, source, history, notes, related records | MOVE_TO_DETAIL | Preserved in inventory detail. |
| Repeated sale action | MOVE_TO_DETAIL | Sale creation remains deliberate and quantity-validated. |

Why retained elements deserve initial space: the list supports locating stock and spotting its cost/status without duplicating the detail page.

### 11. Sales

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Persistent Business destination tabs | DUPLICATE | Replaced by Back to Business. |
| Sales heading and Record Sale | KEEP | Defines the workflow and dominant action. |
| Sale count and realized result summary | KEEP | Compact real-record totals only. |
| Search/filter controls | COLLAPSE | One filter/search surface remains. |
| Record title, channel/date, proceeds/profit | KEEP | Minimum information for recognition and review. |
| Full fee, shipping, refund, COGS, ROI, and notes breakdown | MOVE_TO_DETAIL | Preserved in sale detail. |
| Multiple edit/status actions | MOVE_TO_DETAIL | Canonical controls remain in detail. |

Why retained elements deserve initial space: the list shows what sold and the realized result; the complete accounting trail stays in detail.

### 12. Money

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Persistent Business tabs | DUPLICATE | Replaced by Back to Business. |
| Expenses, Mileage, Reports, Reconciliation tabs | KEEP / MOVE_TO_MORE_MENU | First three stay visible; Reconciliation moves to More. |
| Money heading and context | KEEP | Keeps bookkeeping separate from sales/inventory. |
| Relevant add action | KEEP | One action for the active money view. |
| Multiple financial metric rows | MOVE_TO_DETAIL | Detailed metrics remain under Reports. |
| Expense/trip recognition fields | KEEP | Date, merchant/destination, amount/miles remain in the list. |
| Receipt, related records, notes, and full calculation | MOVE_TO_DETAIL | Preserved in record detail. |

Why retained elements deserve initial space: the current ledger type, one creation action, and recognizable records are enough; reporting and reconciliation remain available without permanent tab pressure.

### 13. Owner Center Overview

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Owner Center title and Owner Only badge | KEEP | Makes the authorization boundary explicit. |
| Overview, Sourcing, Restocks, Performance, Controls tabs | KEEP / MOVE_TO_MORE_MENU | First three stay visible; Performance and Controls move to More. |
| Opportunity metric cards | MOVE_TO_DETAIL | Detailed opportunity metrics remain in Sourcing. |
| Today’s Priorities list | DUPLICATE | Replaced by five canonical status rows. |
| Best Opportunities cards | MOVE_TO_DETAIL | Remain in Sourcing → All Opportunities. |
| Scanner Health technical panel and logs | MOVE_TO_OWNER_CENTER | Kept in deeper Sourcing/Controls screens, not the Overview. |
| Scanner status | KEEP | One compact row links to connection details. |
| Imports awaiting review | KEEP | One row links to the import queue. |
| Auctions ending soon | KEEP | One row links to owner auction sourcing. |
| Likely restocks | KEEP | One probability-safe row links to Restocks. |
| Failures requiring action | KEEP | One row, with no raw logs until opened. |
| Empty opportunity and metric containers | REMOVE | They no longer occupy the overview. |

Why retained elements deserve initial space: the five rows are exactly the owner exceptions that may require action; analysis and configuration stay one level deeper.

### 14. Owner Center Sourcing

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Owner Center title/badge and primary section navigation | KEEP | Preserves owner context and access boundary. |
| All Opportunities, eBay, Auctions, Imports, Search Rules tabs | KEEP / MOVE_TO_MORE_MENU | First three remain; Imports and Search Rules move to More. |
| Full filter matrix and sort controls | COLLAPSE | One disclosure contains advanced filters and sorting. |
| Source, product type, price, profit, ROI, confidence, distance, review filters | KEEP | All behavior remains inside the disclosure. |
| Opportunity image/title/source/price/result/urgency | KEEP | Compact cross-source review facts. |
| Technical provider fields and request details | MOVE_TO_OWNER_CENTER | Remain in eBay/Controls detail, never on everyday Find cards. |
| eBay searches, duplicate/change/import/performance metrics | MOVE_TO_DETAIL | Remain specifically under Sourcing → eBay. |

Why retained elements deserve initial space: source tabs and opportunity summaries support owner review; the full filter and technical state are available on demand.

### 15. Owner Center Restocks

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Live, Stores, Products, Patterns tabs | KEEP / MOVE_TO_MORE_MENU | First three remain; Patterns moves to More. |
| Seven restock summary metrics | REMOVE / MOVE_TO_DETAIL | Live summary is limited to four; history/performance metrics remain in Stores/Patterns. |
| Newly confirmed restocks and likely windows | KEEP | These are the actionable live signals. |
| Stale reports, nearby stores, observations, last confirmation, confidence | KEEP / MOVE_TO_DETAIL | Only live-relevant values remain; supporting history stays in details. |
| Store profiles, supporting events, visit history, prediction outcomes | MOVE_TO_DETAIL | Preserved in Store and Patterns views. |
| Empty panels for absent restock types | REMOVE | One honest state replaces unused containers. |

Why retained elements deserve initial space: Live exposes current evidence and confidence; all historical support remains accessible without implying certainty.

### 16. Global Add

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Add title and close control | KEEP | Provides context and keyboard/screen-reader dismissal. |
| Hero card, large plus, explanatory paragraph | REMOVE | The sheet purpose is already clear. |
| Scan Listing | KEEP | First high-frequency sourcing action. |
| Analyze Deal | KEEP | First high-frequency evaluation action. |
| Record Purchase | KEEP | First high-frequency business action. |
| Add Collection Item | KEEP | First high-frequency collection action. |
| Record Sale | KEEP | First high-frequency realized-result action. |
| Add Auction, Add Resale Inventory, Add Expense, Add Mileage, Add Receipt | MOVE_TO_MORE_MENU | All remain functional behind More. |
| Kids & Community action | MOVE_TO_MORE_MENU | Appears only when the existing feature control enables it. |
| Create Task | REMOVE | No working task-creation workflow exists; global rules require unavailable actions to stay hidden. No task data or route was removed. |
| Description beneath every action | REMOVE | Meaningful descriptions remain in accessible labels. |
| Repeated review/safety footer | DUPLICATE | Removed from this menu; review gates remain in the actual workflows. |

Why retained elements deserve initial space: the first five are the most frequent cross-workspace actions and fit in a single clean bottom sheet without descriptions.

### 17. Deal Analysis

| Baseline visible element or pattern | Classification | After-state decision |
| --- | --- | --- |
| Find context, Deal Analysis title, five-step progress | KEEP | Required for orientation in the resumable workflow. |
| Introductory warning paragraph | REMOVE | Existing field labels, result wording, and accessible context remain. |
| Current-step fields and one Continue/decision action | KEEP | Only inputs needed for the active step are visible. |
| All steps’ fields simultaneously | COLLAPSE | Existing guided steps continue to disclose them progressively. |
| Recommendation, maximum offer, landed cost | KEEP | These are the decision priorities. |
| Low/mid/high resale, profit, and ROI table | KEEP | Required scenario comparison; formulas are unchanged. |
| Confidence and risk summary | KEEP | Shows uncertainty without implying a purchase instruction. |
| Break-even, max purchase, rule checks, missing information, full risk explanation, calculation explanation | COLLAPSE | Preserved under `Assumptions & calculation`. |
| Duplicate Save button inside the result and sticky bar | DUPLICATE | One sticky `Save decision` action remains. |
| Back and Clear | KEEP | Two non-primary recovery actions remain. |
| Buy/purchase instruction language | REMOVE | Recommendation remains informational and assumption-based. |

Why retained elements deserve initial space: the active step contains only its inputs; the final screen prioritizes the recommendation and core financial scenarios while retaining the full calculation behind disclosure.

## Baseline-element disposition

The following source-and-screenshot inventory counts each baseline interface unit once, then counts units no longer initially visible because they were removed, collapsed, moved to detail/Owner Center/More, or deduplicated.

| Screen | Baseline units | Removed or hidden baseline units | Reduction |
| --- | ---: | ---: | ---: |
| Home | 41 | 22 | 53.7% |
| Find | 19 | 7 | 36.8% |
| Deals | 33 | 13 | 39.4% |
| Restocks | 18 | 6 | 33.3% |
| Auctions | 21 | 7 | 33.3% |
| Collection | 27 | 10 | 37.0% |
| Collection item detail | 26 | 8 | 30.8% |
| Business | 24 | 15 | 62.5% |
| Purchases | 24 | 8 | 33.3% |
| Inventory | 25 | 8 | 32.0% |
| Sales | 24 | 8 | 33.3% |
| Money | 22 | 7 | 31.8% |
| Owner Center Overview | 36 | 23 | 63.9% |
| Owner Center Sourcing | 28 | 10 | 35.7% |
| Owner Center Restocks | 25 | 9 | 36.0% |
| Global Add | 31 | 23 | 74.2% |
| Deal Analysis | 32 | 12 | 37.5% |
| **Total** | **456** | **196** | **43.0%** |

This exceeds the 30% subtraction objective while preserving the underlying routes, records, calculations, import review gate, provider logic, storage keys, authorization, and compatibility behavior.

## Automated initial-viewport comparison

These counts are generated from elements that intersect the first 360 × 800 viewport. Counts are scoped to the active page or dialog, excluding persistent shell chrome. `Primary top` is the number of pixels consumed before the first primary content region. Text is counted by rendered text-line position, not by DOM node.

| Screen | Sections before → after | Cards before → after | Buttons before → after | Badges before → after | Text lines before → after | Primary top before → after | Full page height before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 2 → 3 | 0 → 0 | 6 → 5 | 1 → 0 | 24 → 20 | 342 → 270 | 2,676 → 1,105 |
| Find | 2 → 2 | 2 → 2 | 10 → 8 | 1 → 0 | 18 → 20 | 500 → 290 | 1,894 → 902 |
| Deal Feed | 2 → 2 | 2 → 2 | 10 → 8 | 1 → 0 | 18 → 20 | 500 → 290 | 1,894 → 902 |
| Collection | 1 → 1 | 5 → 3 | 6 → 7 | 0 → 0 | 14 → 16 | 732 → 501 | 1,303 → 800 |
| Business | 2 → 0 | 5 → 0 | 5 → 4 | 0 → 0 | 19 → 12 | 400 → 206 | 1,615 → 800 |
| Owner Center Overview | 1 → 1 | 3 → 0 | 5 → 10 | 1 → 1 | 16 → 22 | 517 → 376 | 3,868 → 800 |
| Global Add | 0 → 0 | 0 → 0 | 6 → 7 | 0 → 0 | 37 → 8 | 342 → 270 | 2,676 → 1,105 |
| Deal Analysis result | 2 → 2 | 1 → 1 | 14 → 12 | 1 → 0 | 20 → 23 | 500 → 342 | 2,550 → 1,336 |

Interpretation: moving primary content upward can increase first-viewport text or button counts even while total page depth and baseline clutter fall sharply. Owner Center is the clearest example: five useful status-row buttons now fit in the initial viewport, replacing a 3,868-pixel page of metric cards and panels. The disposition table measures removal of the original clutter; the automated table records the actual rendered outcome without treating newly reachable information as a reduction.

All audited mobile after captures report zero horizontal overflow.

## QA artifacts

- Exact-commit before captures: `artifacts/qa/declutter-density-pass/before/`
- Current after captures: `artifacts/qa/declutter-density-pass/after/`
- Baseline metrics: `artifacts/qa/declutter-density-pass/before-metrics.json`
- After metrics: `artifacts/qa/declutter-density-pass/after-metrics.json`

The capture directory is intentionally ignored and is not production source data.
