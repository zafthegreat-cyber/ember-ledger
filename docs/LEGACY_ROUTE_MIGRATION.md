# Legacy Route Migration

Audited 2026-08-14 on `ui-104-final-product-ui-2` at stabilization checkpoint `ad01c80`. This inventory separates visible navigation from compatibility URLs. A compatibility route is not removed merely because its name is old.

Classification meanings are exact: `KEEP_AND_REDESIGN`, `MERGE_INTO_CANONICAL_SCREEN`, `OWNER_CENTER_ONLY`, `REDIRECT`, `ARCHIVE`, and `REMOVE_AFTER_MIGRATION`.

Common dependencies: legacy collector/business screens use the existing `et-tcg-*` browser keys and their established repositories; Deal Finder uses its versioned local repository; Owner Center uses its owner repository; eBay discovery remains server-mediated. `appRouteState.js`, the broad beta smoke suite, route-loading tests, menu-route tests, and area-specific smoke tests are the principal route consumers.

| Current path | Current visible label / purpose | Canonical replacement | Data / tests | Risk | Classification | Recommended action |
|---|---|---|---|---|---|---|
| `/` | Home command center | `/` Home | all summaries; Hearth/beta smoke | High | KEEP_AND_REDESIGN | Keep canonical Home and continue extracting legacy render helpers. |
| `/find/deals`, `/find/deal-feed` | Deals / normalized inbox | `/find/deals` | Deal Finder repository; Flip Scout/browser tests | High | KEEP_AND_REDESIGN | Keep one Deals implementation; alias Deal Feed. |
| `/find/ebay`, `/find/ebay-search` | Active eBay listing search | `/find/ebay` | eBay server routes and provider listings; eBay tests | Critical | KEEP_AND_REDESIGN | Preserve server-only credentials and Import Review. |
| `/find/saved-searches`, `/find/rules` | Saved searches | `/find/saved-searches` | search rules; eBay/Flip Scout tests | High | MERGE_INTO_CANONICAL_SCREEN | Render one rules editor, exposed mainly through Owner Center. |
| `/find/deal-analysis`, `/find/analyze` | Deal Analysis | `/find/deal-analysis` | calculation inputs; Flip Scout tests | High | KEEP_AND_REDESIGN | Keep guided analysis and lazy-load it. |
| `/find/auctions` | Auctions | `/find/auctions` | auction records; Flip Scout tests | High | KEEP_AND_REDESIGN | Keep canonical owner/manual workflow; no automation. |
| `/find/restocks` | Restock entry | `/owner-center/restocks/live` | restock records; Owner tests | Medium | OWNER_CENTER_ONLY | Keep lightweight handoff, not a duplicate intelligence screen. |
| `/find/sources`, `/find/integrations` | Source capability/data tools | `/owner-center/controls/connections` | provider status/import/export | High | OWNER_CENTER_ONLY | Migrate advanced configuration; retain direct Find handoff temporarily. |
| `/scout/flip-scout` | legacy Deal Finder entry | `/find/deals` | Flip Scout route test | Medium | REDIRECT | Replace URL while preserving query/hash. |
| `/scout/restocks`, `/scout/stores`, `/scout/stores/:id` | local restock reports and store details | `/owner-center/restocks/live` or `/stores` | Scout/store data; Scout/store tests | High | MERGE_INTO_CANONICAL_SCREEN | Preserve detailed store route until Owner Center has full parity. |
| `/scout/map`, `/scout/calendar`, `/scout/report`, `/scout/review` | map, calendar and report workflows | future Owner Center restock routes | report keys; Scout layout/save tests | High | REMOVE_AFTER_MIGRATION | Keep functional routes until parity and data verification. |
| `/scout/settings` | old sourcing settings | `/owner-center/controls` | settings keys; Scout tests | Medium | OWNER_CENTER_ONLY | Alias after controls cover all settings. |
| `/vault`, `/vault/cards`, `/vault/sealed`, `/vault/sets` | collection browsing | `/collection`, `/collection/items`, `/collection/sets` | owned inventory keys; Vault tests | Critical | MERGE_INTO_CANONICAL_SCREEN | Preserve detail/workflow routes while Collection reaches parity. |
| `/vault/collections`, `/vault/wishlist`, `/vault/grading` | binders, wishlist, grading | `/collection/sets`, `/collection/wishlist`, `/collection/grading` | collection keys; Vault workflow tests | High | REDIRECT | Redirect when canonical tabs retain deep state. |
| `/vault/add`, `/vault/import`, `/vault/settings` | collection actions/settings | Global Add or `/settings` | inventory import/settings tests | High | REMOVE_AFTER_MIGRATION | Retain action deep links until global flows are equivalent. |
| `/forge`, `/forge/inventory`, `/forge/purchases`, `/forge/sales` | business operations | `/business`, `/business/inventory`, `/business/purchases`, `/business/sales` | resale records; Forge/business tests | Critical | MERGE_INTO_CANONICAL_SCREEN | Canonical Business is primary; legacy details remain compatible. |
| `/forge/reports`, `/forge/tax`, `/forge/export`, `/forge/settings` | reports and controls | `/business/money/reports` or Settings | financial/export keys; tax/export tests | High | REMOVE_AFTER_MIGRATION | Preserve until report/export parity is tested. |
| `/purchases` | old purchases shortcut | `/business/purchases` | route tests | Low | REDIRECT | Redirect with history replacement. |
| `/inventory` | old inventory shortcut | `/business/inventory` | route tests | Low | REDIRECT | Redirect with history replacement. |
| `/sell`, `/sales` | old sales shortcuts | `/business/sales` | route tests | Low | REDIRECT | Redirect with history replacement. |
| `/exchange/market`, `/market`, `/tidetradr`, `/tidetradr/catalog` | product research/catalog | `/exchange/market` (future canonical placement undecided) | catalog/market keys; market tests | High | KEEP_AND_REDESIGN | Keep functionality; remove old visible product names. |
| `/exchange/harbor`, `/harbor` | listings exchange | `/exchange/harbor` | marketplace listing keys/tests | High | ARCHIVE | Hide from everyday navigation; keep read-compatible until product decision. |
| `/exchange/forge` | exchange-specific selling surface | `/business/sales` after parity | listing/sales keys; exchange layout tests | High | REMOVE_AFTER_MIGRATION | Do not redirect until records and actions are equivalent. |
| `/kids-community`, `/spark`, `/kids-program` | Kids & Community | `/kids-community` | kids records; safety tests | High | REDIRECT | Canonical plain-language route; keep internal module names. |
| `/kids-community/community`, `/tidepool`, `/tidepool/post/:id` | community and post details | `/kids-community/community/:id` | community keys; moderation tests | Critical | MERGE_INTO_CANONICAL_SCREEN | Preserve IDs and safety/moderation behavior. |
| `/kids-community/parent`, `/parent`, `/parent-center` | parent controls | `/kids-community/parent` | consent/safety data; parent tests | Critical | REDIRECT | Canonicalize without changing authorization. |
| `/kids-community/donate`, `/kids-community/thank-you` | program contribution flows | same canonical paths | program records; kids tests | High | KEEP_AND_REDESIGN | Keep only if current safety and no-payment claims remain accurate. |
| `/owner-center/*` | owner sourcing/performance/controls | same | owner repository; owner/auth tests | Critical | OWNER_CENTER_ONLY | Keep guarded on navigation and render. |
| `/integrations` | old integrations shortcut | `/owner-center/controls/connections` | provider state; compatibility test | Critical | OWNER_CENTER_ONLY | Redirect then enforce owner guard. |
| `/admin`, `/admin/*` | administration | future consolidated administration | admin/Supabase data; admin tests | Critical | KEEP_AND_REDESIGN | Keep role guard; migrate only with dedicated authorization pass. |
| `/moderator`, `/moderation` | moderation queues | future consolidated administration | moderation data/tests | Critical | KEEP_AND_REDESIGN | Preserve separate authorization boundary. |
| `/settings` | Settings | `/settings` | settings keys; menu tests | High | KEEP_AND_REDESIGN | Canonical settings root. |
| `/profile`, `/profile/progress` | profile | `/settings/profile[/progress]` | profile keys; menu tests | Medium | REDIRECT | Preserve subpath. |
| `/account` | account | `/settings/account` | account/auth; menu tests | High | REDIRECT | Replace URL without weakening auth. |
| `/collections`, `/workspaces` | workspace/family settings | `/settings/workspaces` | workspace keys/tests | High | REDIRECT | Preserve workspace identity and invites. |
| `/data-backup`, `/backup` | backup/import/export | `/settings/data-backup` | all local keys; resilience tests | Critical | REDIRECT | Keep existing serialization and confirmations. |
| `/tcg-os` | system map | `/settings/system-map` | none beyond UI; menu tests | Low | REDIRECT | Plain-language URL and label. |
| `/help`, `/support`, `/assistant` | help / Business Assistant | `/settings/help` | assistant local behavior/tests | Medium | REDIRECT | Never imply unavailable AI service. |
| `/menu`, `/more` | old utility menu | `/settings` | menu tests | Low | REDIRECT | Replace with Settings. |
| `/membership`, `/tiers`, `/plans` | plan information | `/settings/plans` | feature gates/tests | Medium | REDIRECT | Preserve feature truthfulness; no billing claims. |
| `/privacy`, `/terms`, `/trust` | policy/trust | `/settings/privacy`, `/settings/terms`, `/settings/trust` | static content/tests | High | REDIRECT | Preserve exact policy content. |
| `/links` | links | `/settings/links` | local settings | Low | REDIRECT | Canonicalize. |
| `/whats-new`, `/changelog` | announcements | `/settings/announcements` | static data | Low | REDIRECT | Canonicalize. |
| `/known-limitations` | limitations | `/settings/known-limitations` | static truthfulness copy | Medium | REDIRECT | Keep accessible. |
| `/coming-soon`, `/roadmap` | roadmap | `/settings/roadmap` | static data | Low | REDIRECT | Canonicalize. |
| `/partner`, `/sponsor` | partnerships | `/settings/partnerships` | static/local forms | Medium | REDIRECT | Keep no-live-submission claims where applicable. |
| `/beta-invite/*`, `/workspace-invite/*`, auth/reset routes | invite/auth utilities | unchanged | auth and invite services/tests | Critical | KEEP_AND_REDESIGN | Excluded from cosmetic redirects; security first. |
| `/screen-set.html` | historical visual QA screen | artifact only | no production storage | Low | ARCHIVE | Keep outside primary navigation; do not treat as canonical UI. |

## Intentionally retained internal occurrences

- Compatibility paths and parser keys such as `scout`, `vault`, `forge`, `spark`, and `tidepool` remain where renaming would break deep links or state restoration.
- Existing storage namespaces and keys—including `emberTideRoute`, `et-tcg-*`, and the versioned Deal Finder repository key—remain unchanged.
- Internal component/module/function names (`Scout`, `Vault`, `Forge`, `EmberAssist`) remain migration identifiers. Runtime display copy is normalized in the operations shell.
- Existing environment-variable names remain unchanged, including all eBay names. No credential name or server route was cosmetically renamed.
- Historical documentation, test descriptions, CSS compatibility selectors, and generated/static catalog product text are not mass-rewritten.
- Product names containing ordinary words such as Pokémon's “Dragon Vault” and “Obsidian Flames” are explicitly protected from generic word replacement.

## Migration rule

Only `REDIRECT` entries are safe for immediate URL canonicalization. `MERGE_INTO_CANONICAL_SCREEN` and `REMOVE_AFTER_MIGRATION` entries require data parity, direct-load coverage, and back-button verification before their old renderers can be deleted.
