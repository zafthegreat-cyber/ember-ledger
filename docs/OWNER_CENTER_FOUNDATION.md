# Owner Center foundation

## Authorization

Owner Center uses the existing application-role resolver. Production access requires `OWNER` on the current or subscription profile, and the page renders an access-denied state when the guard fails. Hiding the navigation item is not the security boundary.

The repository does not yet provide a server-rendered role boundary for the client application. The local beta's single `local-beta` identity is treated as the device owner so the private workspace can be tested. Owner Center currently changes only device-local records and does not expose a privileged server mutation. Before multi-user deployment, enforce the same owner role on every future Owner Center server endpoint.

## Owned-item purpose compatibility

The canonical field is `ownedItemPurpose`:

- `PERSONAL_COLLECTION`
- `FOR_RESALE`
- `HOLD`
- `KIDS_COMMUNITY`
- `UNASSIGNED`

No irreversible migration runs in this phase. Existing item records are mapped at read time from legacy destination, record type, status, and business-inventory fields. A user-initiated purpose change writes `ownedItemPurpose`, `purposeUpdatedAt`, and an append-only `purposeHistory` entry while preserving the original record, source, cost, images, and notes.

Records without an explicit purpose or a recognizable legacy collection, wishlist, kids/community, or resale signal remain `UNASSIGNED`. The Collection compatibility notice reports how many records still need an intentional purpose choice.

## Owner Center local storage

Owner Center settings and new restock-intelligence records use the versioned key `private-business-hub.owner-center.v1`. Existing application and Deal Finder storage keys are unchanged.

Stored collections are:

- restock store profiles
- restock events
- restock predictions
- store visits
- product observations
- import summaries
- job summaries
- scoring and feature controls

Existing local store reports are adapted at read time. A store-directory record alone does not count as a confirmed restock. Pattern and efficiency metrics return “Not enough data” or list missing requirements instead of inventing zeroes.

## Marketplace boundaries

The existing server-side eBay Browse connector and Import Review gate are unchanged. Active asking prices are labeled as active listings, never sold comparables or market values. Owner Center adds no scraping, account actions, automatic purchases, offers, or bids.
