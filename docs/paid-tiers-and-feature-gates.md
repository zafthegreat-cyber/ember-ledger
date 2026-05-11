# Paid Tiers and Feature Gates

This is the beta feature-gate foundation. Real billing is not connected yet.

## Plans

### Free
- Basic Vault
- Basic catalog search
- Limited scanner/search
- Wishlist
- Basic Scout reports
- Basic marketplace draft
- Manual add

### Collector Plus
- Unlimited Vault/collection tracking
- Unlimited scans/searches
- Set completion
- Portfolio value
- Price history
- Wishlist alerts
- Variants
- Graded/slab tracking
- Collection export

### Seller Pro
- Forge inventory
- Sales tracking
- Expenses
- Mileage
- Receipt scan/review
- Profit/loss
- Deal Finder
- Marketplace drafts
- CSV exports
- Whatnot/eBay/Facebook listing prep
- Cross-listing status
- Business reports

### Scout Premium
- Scout Route Planner
- Predicted restock windows
- Store confidence scores
- Watchlist route planning
- Advanced store history
- Text alerts later
- Online monitor later
- Auto-open page later

### Ultimate
- Collector Plus + Seller Pro + Scout Premium
- Shared workspace/team access
- Advanced reports
- Priority alerts
- Export tools

## Current Implementation

The central feature gate map lives in:

- `src/services/featureGates.js`

Legacy imports still work through:

- `src/constants/plans.js`

The gate helper is:

- `canUseFeature(userPlan, featureKey, options)`

Unknown feature keys fail closed unless an override is active.

## Overrides

Features unlock if any of these are true:

- User profile has an allowed plan.
- User is admin.
- User is marked as a beta tester.
- Private local beta mode is active.
- Local QA unlock is active with `VITE_QA_UNLOCK_PAID_FEATURES=true` or `?qaUnlockPaid=true`.

QA unlock is local-only and must not become the production default.

## Gated First

The first gated areas are:

- Receipt Scan/Review: Seller Pro or Ultimate
- Deal Finder: Seller Pro or Ultimate
- Marketplace CSV/Whatnot export: Seller Pro or Ultimate
- Scout Route Planner: Scout Premium or Ultimate
- Advanced restock predictions: Scout Premium or Ultimate
- Set completion: Collector Plus or Ultimate
- Portfolio value: Collector Plus or Ultimate
- Shared workspace/team access: Ultimate

Free remains usable for:

- Basic Vault
- Basic catalog search
- Manual add
- Wishlist
- Basic Scout reports
- Basic marketplace drafts

## Locked Feature UI

Locked features use:

- `src/components/LockedFeatureNotice.jsx`

The notice shows:

- Feature name
- Feature description
- Unlocking tier
- Billing coming soon
- Request beta access

It does not show Stripe, checkout, or fake payment links.

## Future Billing Plan

When billing is ready:

1. Add Stripe checkout and customer portal through backend-only endpoints.
2. Store subscription status and tier in trusted profile/app metadata.
3. Keep client-side gates as UX only.
4. Enforce paid access on backend and database-protected actions where needed.
5. Keep admin and QA overrides explicit and auditable.

No Stripe or payment processing is connected in the current beta checkpoint.
