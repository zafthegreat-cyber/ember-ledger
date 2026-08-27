# Code 3 Product Workspace Architecture Contract

Status: Phase 2A.5 local implementation contract. Phase 2A is published at `c76e3e4bc668c08d9a0908c9bb2cd96444610297`; Phase 2A.5 remains local and unpublished until a separately authorized checkpoint.

This contract reorganizes presentation and route ownership. It does not authorize Inbox or order ingestion, an email or Bot provider, billing, a database migration, synchronization, `REMOTE_ACTIVE`, automated purchasing, or Production deployment.

## Purpose

Code 3 remains one application with one authentication boundary, one persistence architecture, one backup contract, and shared domain records. It presents five focused product workspaces:

1. Collect;
2. Find;
3. Sell;
4. Bot;
5. Business.

Owner Center remains a separate private system and administration surface. It is not a sixth product workspace and is never an entitlement tier.

The workspace shell changes where a capability is presented. It does not duplicate records, fork business logic, create a new persistence authority, or imply that future capabilities exist.

## Canonical workspace homes

Phase 2A.5 uses compatibility-first home routes:

| Workspace | Canonical home | Current purpose |
|---|---|---|
| Collect | `/collect` | personal collection and owned-item work |
| Find | `/find/home` | sourcing opportunities, deals, restocks, and auctions |
| Sell | `/sell/home` | resale inventory and sale preparation/operations |
| Bot | `/bot` | OWNER-only honest foundation; no provider is connected |
| Business | `/business` | purchases, money, Account Ops entry, and business operations |

Existing feature URLs remain valid where practical. In particular, `/collection`, `/find/deals`, `/find/restocks`, `/find/auctions`, `/business/purchases`, `/business/inventory`, `/business/sales`, `/account-ops/*`, and `/owner-center/*` keep their established meaning. Compatibility aliases must resolve to a real destination without loops or silently changing the underlying workflow.

The workspace home is not proof that every feature described for that workspace is implemented. Empty and foundation states must be honest.

## Workspace definitions and current mappings

### Collect

Collect owns the personal-ownership presentation: collection browsing, item details, sets, binders, wishlist, grading candidates, unassigned-purpose review, card identification, and apparent-condition analysis where those capabilities already exist.

Resale inventory and business purchase accounting do not move into Collect merely because the record describes a card. The underlying owned item retains one purpose and history.

### Find

Find owns acquisition discovery: Deal Inbox, Deal Analysis, official eBay active-listing evidence, Import Review, auctions, restocks, Search Rules, sourcing watch/saved states, and explainable opportunity intelligence.

Find answers what deserves review. It does not own the final Purchase or perform buying, offers, bids, messages, or checkout.

### Sell

Sell owns resale projections and operational views over existing resale inventory and sales records. Current implemented mappings may expose inventory, listing preparation foundations, sales, shipping/returns foundations, and realized-result views. Marketplace listing publication, external order ingestion, automatic offers, and checkout are not implemented by the workspace shell.

### Bot

Bot is OWNER-only. Phase 2A.5 supplies a private shell, route, capability truth, and an honest empty/foundation state. No Stellar, Hayha, Valor, proxy, checkout, task-control, or other Bot provider is connected. No purchase, signup, verification, CAPTCHA/OTP, anti-bot, or access-control bypass capability exists.

Bot cannot be unlocked through remembered local state, a feature flag, or a subscription label. Direct navigation must pass the verified OWNER session boundary before private content or storage loads.

### Business

Business owns business operations such as purchases, receiving, business inventory/cost, expenses, mileage, sales records, reports, and operational tools to the extent each is actually implemented.

Account Ops is associated with the Business workspace for navigation and context, but it retains `VERIFIED_OWNER` access. Business workspace availability does not authorize Account Ops or load `code3.account-ops.v1`.

### Owner Center

Owner Center remains outside the product-workspace switcher. It owns security, backup/recovery, migration readiness, persistence controls, feature controls, diagnostics, sourcing administration, and system status. It requires verified OWNER authorization and remains distinct from paid or future product entitlements.

Leaving Owner Center may return to the last available product workspace, but Owner Center must never be saved as the normal product-workspace preference.

## Route ownership registry

Every first-class route has one explicit classification:

- `COLLECT`;
- `FIND`;
- `SELL`;
- `BOT`;
- `BUSINESS`;
- `OWNER`;
- `GLOBAL`;
- `LEGACY_REDIRECT`.

The central route/workspace registry is presentation and navigation metadata. Each route entry can declare:

- canonical path and label;
- workspace ownership;
- optional icon key;
- visibility and navigation placement;
- mobile and desktop eligibility;
- required authority;
- compatibility aliases;
- feature availability and implementation state;
- a future entitlement hint.

Authorization remains in the verified application-session and backend policy layers. A registry entry, browser flag, query parameter, localStorage value, or hidden menu item cannot grant access.

Registry validation must reject duplicate canonical paths, unknown workspace values, broken aliases, invalid navigation targets, an OWNER route classified as public, and an unimplemented route advertised as active.

## Workspace switcher

The compact global switcher reflects the current route and lists only workspaces available to the current session. It works with keyboard and pointer input, conveys the active workspace without relying on color alone, and fits at 360 pixels without horizontal overflow.

Expected visibility:

- Collect, Find, Sell, and Business are product-workspace choices subject to their feature availability metadata;
- Bot appears only for a verified OWNER;
- Owner Center never appears as an ordinary product workspace.

Choosing a workspace navigates to its canonical home. The user does not need to return to a universal dashboard before switching.

## Remembered product workspace

The local preference uses a dedicated versioned key, `code3.workspace-preference.v1`. It is deliberately separate from the historical persisted collaboration/data `Workspace` records and `activeWorkspaceId` preference. Those legacy records are not renamed, migrated, or reinterpreted by Phase 2A.5.

The preference stores `schemaVersion`, a public `lastProductWorkspace`, `updatedAt`, and an optional `lastSelectedWorkspace`. For a currently verified owner, `lastSelectedWorkspace` may retain `BOT` only as inert presentation history; it never grants access and is ignored in favor of the public fallback without current verified OWNER authorization. Owner Center and all role, authority, entitlement, token, session, owner-identifier, business-record, and route-payload fields are prohibited.

Resolution precedence is:

1. a recognized direct route;
2. a valid remembered available public product workspace;
3. a safe public fallback.

A direct URL always overrides the remembered preference. Invalid, stale, unavailable, or unauthorized values fall back safely. A remembered Bot marker is usable only after the current session independently passes the authoritative OWNER check; Owner Center is never a product-workspace preference. Logout or session downgrade cannot expose a previously visible OWNER surface.

Because the preference is reconstructible UI state and contains no business record or authority, Backup Format v1 registers it inside the existing non-coverage `safe-ui-preferences` source. It does not add a backup source, change the published source counts, affect coverage status, or give Restore Preview any private-workspace or authorization semantics.

## Navigation layers

Code 3 has three navigation layers:

1. **Global:** product-workspace switcher, carefully bounded global quick actions, profile/owner affordance.
2. **Workspace-local:** implemented destinations relevant to the active workspace.
3. **Private administration:** Owner Center and other verified OWNER entry points outside the product-workspace switcher.

Mobile navigation must not flatten all Code 3 features into one dock. It uses the active workspace's implemented destinations, safe-area spacing, reachable 44-pixel targets, and compact overflow for secondary destinations. Desktop may combine the switcher with workspace-local navigation and an OWNER-only administration affordance; it must not restore one giant sidebar of every route.

Only working destinations are presented as active navigation. A shell or future capability must not be added merely to fill a tab count.

## Global and cross-workspace actions

An action can be global, workspace-local, or a cross-workspace handoff. Global actions such as Scan, Search, Quick Add, Record Expense, or Find Deal appear only when their current workflow exists and route automatically into the owning workspace.

Cross-workspace actions preserve record identity and useful route context. Supported or future-safe handoffs include:

- opportunity → Record Purchase;
- purchase → Receive Inventory;
- owned item → Add to Collection or Move to Sell;
- collection item → Sell This Item;
- resale item → View Source Deal or View Purchase;
- sale → View Profit.

The shell navigates to or projects the same underlying record. It must not create disconnected Collect, Sell, and Business copies of the same physical item, opportunity, purchase, inventory item, or sale.

## Authority and entitlement metadata

Workspace and feature metadata may reserve the conceptual labels `FREE`, `PLUS`, `PRO`, `BUSINESS`, and `OWNER` for future product packaging. Phase 2A.5 does not implement billing, subscription state, checkout, upgrades, or server entitlements.

`OWNER` is an authority role, not a purchasable tier. Owner Center, Bot, provider credentials, migration controls, diagnostics, and current Account Ops data cannot be exposed by assigning a paid-tier label or browser flag. Any future commercial entitlement must be server-verifiable and remain separate from authentication and OWNER authorization.

## Deep links, compatibility, and history

A direct route selects its owning workspace automatically:

- collection routes select Collect;
- deal, auction, restock, and sourcing routes select Find;
- resale and sales routes select Sell;
- purchase and general business routes select Business;
- `/account-ops/*` provides Business context only after the existing OWNER gate;
- `/bot` requires OWNER and never leaks data before authorization;
- `/owner-center/*` enters the separate owner context.

Current auction navigation resolves to the implemented `/find/auctions` surface. Stable auction-event and lot-detail identifiers are not yet route-addressable, so Phase 2A.5 does not fabricate detail URLs.

Aliases must point to real canonical routes, preserve query/hash information where applicable, and avoid redirect cycles. Browser and Android Back must follow actual navigation history; workspace resolution must not push replacement entries repeatedly or bounce between a saved workspace and a direct route.

Workspace switching should not unnecessarily destroy existing feature state such as Find filters or collection browsing position, but Phase 2A.5 does not introduce a new general caching system.

## Persistence, backup, and migration boundary

Phase 2A.5 changes route and presentation architecture only:

- `LOCAL_ONLY` remains authoritative;
- `MIGRATION_PREVIEW` remains read-only;
- `REMOTE_ACTIVE` remains disabled and guarded by the future owner-confirmed cutover;
- the canonical schema remains unapplied;
- no owner record or file byte is migrated;
- no sync, migration-apply, or rollback executor is activated;
- existing backup sources and record identities remain unchanged.

The workspace registry and shell do not become a second datastore. Workspace selection is the bounded local UI preference described above.

## Accessibility and honest states

Workspace navigation must provide semantic labels, visible focus, keyboard operation, non-color selected state, reduced-motion compatibility, 44-pixel targets, safe-area behavior, and zero horizontal overflow at 360 pixels in light and dark themes.

Workspace homes use only real supported data. Honest empty states include:

- Collect: no collection items yet;
- Find: no watched opportunities yet;
- Sell: no items ready to sell;
- Bot: no Bot integrations are connected;
- Business: no recent business activity.

No home may fabricate provider status, orders, revenue, tasks, or marketplace outcomes.

## Phase 2A.5 non-goals

This phase does not add:

- Gmail, Outlook, IMAP, mailbox OAuth, email parsing, or order ingestion;
- an email provider, secure-vault provider, or provider token persistence;
- Stellar, Hayha, Valor, proxy, Bot task-control, or checkout integration;
- subscription billing, payment processing, or client-authoritative paid state;
- automatic purchasing, offers, bids, messages, signup, checkout, or payment;
- CAPTCHA, OTP, verification, retailer-limit, access-control, or anti-bot bypass;
- a schema application, owner-data migration, remote cutover, sync, restore apply, or Production deployment.

Inbox and Orders remain contracts or existing local business foundations only; a workspace label is not provider integration.

## Acceptance contract

Phase 2A.5 is locally complete only when automated and browser QA verify:

- all registered routes have one valid owner and aliases resolve to real routes;
- Account Ops is Business-associated but remains `VERIFIED_OWNER`;
- Bot and Owner Center are unavailable to non-owners before private storage loads;
- Owner Center is not shown in the product-workspace switcher;
- direct routes override remembered workspace state;
- invalid or stale preferences fail safely;
- representative current and legacy URLs load without loops;
- browser/Android Back remains natural;
- shared records are not cloned by workspace navigation;
- mobile light/dark layouts have no 360-pixel overflow;
- existing backup, persistence, security, Account Ops, intelligence, and regression gates remain green.

Publication, Preview deployment, merge, migrations, provider activation, and Production remain separate approvals.
