# Minimal UI Review

## Scope and method

This review compares the published declutter baseline at `a778b303a7dcec0f120d3dca74ccf852419b8154` with the local mobile-first minimal pass. Captures use the same honest local records at 360 × 800, 412 × 915, and 1440 × 960. The capture harness records visible sections, instrumented container/card selectors, interactive buttons, status badges, the first meaningful record/action position, document height, horizontal overflow, and taps to the main task.

The changes are presentation-only. Routes, storage keys, owned-item history, calculations, authorization, eBay routes and credential handling, Import Review, and record behavior are unchanged.

## Main baseline clutter sources

- The mobile top bar repeated the application name and workspace category before the page title.
- Find stacked a page heading, tabs, More, a list heading, and filters before the first listing.
- Collection repeated its title, a permanent sub-navigation row, metrics, a review queue, filters, and per-item buttons.
- Detail pages exposed primary and secondary actions together and opened dense field sections by default.
- Deal Analysis repeated Find navigation and its own title, then used a large bordered result surface with separate explanation blocks.
- Empty states reserved more space than their immediate action justified.

## 360 × 800 measurements

Counts include controls within the audited screen surface. “Containers” is the stable QA selector count, not a claim that every selected element is visually elevated after the pass.

| Screen | Sections | Containers | Buttons | Badges | First meaningful content | Page height | Horizontal overflow | Taps to main task |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 3 → 3 | 0 → 0 | 5 → 4 | 0 → 0 | 305px → 113px | 1,105px → 800px | 0px → 0px | 1 → 1 |
| Find | 2 → 1 | 3 → 2 | 8 → 11 | 0 → 0 | 398px → 81px | 902px → 869px | 0px → 0px | 0 → 0 |
| Deal Feed | 2 → 1 | 3 → 2 | 8 → 11 | 0 → 0 | 479px → 307px | 902px → 869px | 0px → 0px | 1 → 1 |
| Collection | 1 → 1 | 3 → 3 | 7 → 5 | 0 → 0 | 420px → 81px | 800px → 800px | 0px → 0px | 1 → 1 |
| Business | 0 → 0 | 1 → 1 | 4 → 4 | 0 → 0 | 206px → 81px | 800px → 800px | 0px → 0px | 1 → 1 |
| Owner Center Overview | 1 → 1 | 0 → 0 | 10 → 10 | 1 → 0 | 413px → 181px | 800px → 800px | 0px → 0px | 1 → 1 |
| Global Add | 0 → 0 | 0 → 0 | 7 → 7 | 0 → 0 | 488px → 488px | 1,105px → 800px | 0px → 0px | 1 → 1 |
| Deal Analysis result | 2 → 2 | 1 → 1 | 12 → 7 | 0 → 2 | recommendation about 448px → 197px | 1,336px → 1,014px | 0px → 0px | 1 → 1 |

Find’s button count increases because Deals, Restocks, and Auctions are now explicit destinations directly beside More; the record still exposes only one Review action. Global Add is a bottom sheet, so its page-relative first-action position remains low while the action itself stays in the one-handed thumb area. The Deal Feed record begins at 307px, but its main search action begins at 81px and the screen purpose is immediately clear.

## 412 × 915 measurements

| Screen | Sections | Containers | Buttons | Badges | First meaningful content | Page height | Horizontal overflow | Taps to main task |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 3 → 3 | 0 → 0 | 5 → 4 | 0 → 0 | 307px → 113px | 1,108px → 915px | 0px → 0px | 1 → 1 |
| Find | 2 → 1 | 3 → 2 | 8 → 11 | 0 → 0 | 399px → 81px | 1,017px → 984px | 0px → 0px | 0 → 0 |
| Deal Feed | 2 → 1 | 3 → 2 | 8 → 11 | 0 → 0 | 480px → 307px | 1,017px → 984px | 0px → 0px | 1 → 1 |
| Collection | 1 → 1 | 3 → 3 | 7 → 5 | 0 → 0 | 421px → 81px | 915px → 915px | 0px → 0px | 1 → 1 |
| Business | 0 → 0 | 1 → 1 | 4 → 4 | 0 → 0 | 207px → 81px | 915px → 915px | 0px → 0px | 1 → 1 |
| Owner Center Overview | 1 → 1 | 0 → 0 | 10 → 10 | 1 → 0 | 415px → 181px | 915px → 915px | 0px → 0px | 1 → 1 |
| Global Add | 0 → 0 | 0 → 0 | 7 → 7 | 0 → 0 | 603px → 603px | 1,108px → 915px | 0px → 0px | 1 → 1 |
| Deal Analysis result | 2 → 2 | 1 → 1 | 12 → 9 | 0 → 2 | recommendation about 448px → 197px | 1,336px → 1,031px | 0px → 0px | 1 → 1 |

## Screen-by-screen observations

### Home

Before, a branded top bar, greeting header, and Add action consumed most of the first viewport. After, the shell title is simply Home and actionable rows begin immediately. Needs Attention has at most five flat rows, Best Opportunity appears only when a real qualifying record exists, Recent Activity appears only when populated, and four financial values share one compact summary strip.

### Find and Deal Feed

Search and Filter now lead the screen. Deals, Restocks, and Auctions are the only primary destinations. Saved searches, Deal Analysis, eBay Search, Import Review, Sources, and Search Rule Editor are under More. The feed uses one flat image-led row per listing with price, one profit signal, a combined confidence/risk line, timing, and Review. Secondary Find screens use Back to Deals instead of repeating the primary destination row.

### Collection

Search and Filter begin at 81px. Items and real estimated value share a flat summary; Sets & Binders, Wishlist, Grading, and Unassigned Review live under More. The item row itself is the tap target and has no repeated View Details button.

### Business

The landing page is four flat destinations—Purchases, Inventory, Sales, and Money—with a conditional attention list only when real issues exist. It does not repeat charts, totals, reports, or activity.

### Owner Center Overview

The duplicate Overview heading and large owner badge are removed from mobile. Exactly five flat rows remain: eBay Scanner, Imports Awaiting Review, Auctions Ending Soon, Restock Activity, and Failures Requiring Action. Detailed sourcing, restock, performance, and technical provider information stays in its dedicated section.

### Global Add

The bottom sheet presents five compact rows with no descriptions: Scan Listing, Analyze Deal, Record Purchase, Add Collection Item, and Record Sale. The close control shares the title row. More contains only available secondary actions.

### Deal Analysis

Secondary Find navigation no longer sits above the workflow. Recommendation begins around 197px, followed by Maximum Offer, Landed Cost, Expected Profit, Expected ROI, confidence/risk, and Save decision. Low, midpoint, and high results share one comparison table. Assumptions, calculation, and risks are separate mutually exclusive disclosures on supporting browsers. Formulas and saved assumptions are unchanged.

### Details and states

Record detail pages use one image/identity area, a flat two-by-two summary, one primary action, secondary actions under More, and collapsible detail/history sections. Mobile empty states are short text and one action without an oversized illustration or reserved card.

## Three-second clarity review

All eight required screens pass the purpose-and-primary-action clarity review in the captured states. Two measurements deserve explicit owner review:

- The first Deal Feed record starts at 307px because search, Filter, the three destinations, and Paste Listing precede it. Search begins at 81px, so the primary task is still immediately available.
- Global Add’s first action has a high document coordinate because the sheet is intentionally bottom-anchored. The action is visually close to the thumb rather than delayed by content.

No audited mobile screen has horizontal overflow. Physical Android testing remains necessary for Samsung keyboard resize behavior, autofill overlays, system Back from an open More menu or sheet, landscape safe areas, and photo/camera chooser handoff.

## Capture locations

- Baseline: `artifacts/qa/minimal-ui-pass/before/`
- Local result: `artifacts/qa/minimal-ui-pass/after/`
- Metrics: `artifacts/qa/minimal-ui-pass/before-metrics.json` and `artifacts/qa/minimal-ui-pass/after-metrics.json`

Each capture directory contains Home, Find, Deal Feed, Collection, Business, Owner Center Overview, Global Add, and Deal Analysis result at mobile 360, mobile 412, and desktop sizes. These QA artifacts remain ignored and are not intended for publication or commit.
