# Bundle and Route Performance

Audited and built on 2026-08-14 with Vite 8.0.10. Sizes are minified production output; gzip values are Vite's estimates.

## Before

| Chunk | Minified | Gzip |
|---|---:|---:|
| `App` | 2,328.68 kB | 582.87 kB |
| `FlipScoutPage` (all Deal Finder screens) | 119.30 kB | 28.87 kB |
| `OwnerCenterPage` | 50.16 kB | 13.10 kB |
| `EverydayWorkspaces` | 44.15 kB | 11.19 kB |
| `Scout` | 213.78 kB | 52.87 kB |
| scanner vendor | 467.97 kB | 120.71 kB |

## After

| Chunk | Minified | Gzip |
|---|---:|---:|
| `App` | 2,337.03 kB | 585.71 kB |
| `FlipScoutPage` shell + Deals | 23.35 kB | 7.28 kB |
| Deal Analysis | 12.98 kB | 3.85 kB |
| Auctions | 12.18 kB | 3.74 kB |
| eBay Search / Import Review | 13.80 kB | 4.67 kB |
| Business Records | 29.61 kB | 6.77 kB |
| Saved Searches | 6.84 kB | 2.30 kB |
| Sources / data tools | 6.70 kB | 2.45 kB |
| Restock handoff | 0.61 kB | 0.38 kB |
| Owner Center | 50.17 kB | 13.12 kB |
| Collection / Business workspaces | 44.23 kB | 11.22 kB |

The Deal Finder route entry fell by 95.95 kB minified (80.4%) and 21.59 kB gzip (74.8%). Its advanced workflows now load only when opened. Collection, Business, Owner Center, legacy Scout, legacy Collection, legacy Business, Settings, product research, and Kids & Community were already route-level lazy modules and remain so.

The Home/App chunk increased 8.35 kB minified while adding canonical history, focus/scroll restoration, Android visual-viewport handling, global display-copy compatibility, and the legacy command-board navigation correction. Therefore this phase did **not** reduce the initial Home payload. The remaining warning is accurately retained.

## Routes split in this phase

- `/find/deal-analysis`
- `/find/auctions`
- `/find/ebay` and Import Review states
- `/find/saved-searches`
- Find business-record supporting views
- Find source/data tools
- Find restock handoff

Each uses the shared `LoadingState` inside a `Suspense` boundary. Home and shared primitives are not individually lazy-loaded.

## Remaining large dependencies

- `App.jsx` still owns a large set of legacy render functions and data orchestration. This is the main initial-payload constraint.
- Barcode/camera support remains isolated in the scanner vendor chunk.
- Supabase and React remain stable vendor chunks.
- Scout map/report functionality remains a substantial compatibility module.
- Static catalog/store JSON is fetched separately and is not part of the initial JS chunk.

## Recommended next optimization

Extract legacy settings, administration, community, auth utility, and old detail renderers behind route modules one domain at a time. Measure module-preload behavior after each extraction; do not add hand-written vendor chunks without duplicate-module evidence. Retire old Collection/Business implementations only after canonical feature parity and storage round-trip tests.
