# Code 3 TCG — signed stock and warehouse intake

**Status (November 24, 2026): PR-only, not deployed, not connected, no live retailer warehouse access.**

## Goal

The proposed code3-stock-source-intake function is a **server-to-server**
HTTPS endpoint for signed, approved retailer/supplier events. It does not
scrape or call Target, Walmart, Pokémon Center, Best Buy, Sam's Club or Costco,
and it never buys products, joins queues, or accesses Discord servers.

Stock observations can enter the existing private signals table, where the
read-only app feed shows only sanitized, time-limited observations. Inbound
warehouse evidence is always stored separately in a private staff-only table.
Warehouse arrival, storage, and retailer availability remain distinct.

## Approval required

Before enabling a source, obtain the provider's written authorization and
downstream publication rights, an agreement reference, fixed service endpoint,
supported event schema, product identifiers, rate limits and retention rules.
The source's secret is configured in **Supabase encrypted Edge secrets**, never
in the browser, repository or ChatGPT conversation.

No sources are configured by default. The encrypted variable named
CODE3_STOCK_APPROVED_SOURCE_CONFIG must contain an array of explicitly
approved registrations, each with:

  id: owner-assigned source ID
  retailer: one of the six approved retailers
  mode: official-api OR authorized-feed
  agreementRef: private approved agreement reference
  approved: true
  secretEnv: an encrypted secret named CODE3_STOCK_HMAC_...
  publishStock: true ONLY if public stock redistribution is permitted
  inboundStages: exact approved warehouse stage IDs, default empty

The signature key named by secretEnv must be an independent random secret of
at least 32 characters. Do not paste keys into chat or frontend variables.

The source must also have an authenticated health check in the existing
retailer_intel_sources table, with matching mode, connected=true and a
last_success_at within 15 minutes. Only trusted server/staff verification may
update this health record. Receiving a signed webhook never updates it.
If source health is stale, ingestion fails closed.

## Signed request format

POST to the Edge Function path with headers:

  Content-Type: application/json
  x-code3-source-id: approved-source-id
  x-code3-timestamp: 1795550400
  x-code3-signature: v1=<64 lowercase hex chars>

The value after v1= is HMAC-SHA256 over the UTF-8 bytes for:

  source-id + newline + timestamp + newline + exact-raw-json-body

Use Unix seconds within five minutes of the server time. Body max 4 KiB.
Use a stable eventId across retries. Browser-origin requests are rejected.
For an approved provider that cannot sign, an owner-authorized relay must sign
and forward. Do not use a personal Discord token or unauthorized scraper.

Illustrative stock JSON (not an assertion that this product is in stock):

    {"kind":"stock","eventId":"provider-event-001","sku":"1012850572",
     "signalType":"available_now","observedAt":"2026-11-24T20:00:00.000Z",
     "productUrl":"https://www.target.com/p/hoc2/A-1012850572"}

Illustrative warehouse evidence JSON (not an actual shipment):

    {"kind":"inbound","eventId":"provider-putaway-001","sku":"1012850572",
     "stage":"in_warehouse","evidenceType":"warehouse_putaway",
     "observedAt":"2026-11-24T20:00:00.000Z",
     "productUrl":"https://www.target.com/p/hoc2/A-1012850572"}

## Warehouse evidence

A provider must have the stage individually approved, and supply the
matching evidence type:

| Stage | Evidence type |
| --- | --- |
| ordered | purchase_order |
| en_route | advance_shipping_notice |
| arrived_warehouse | receiving_confirmation |
| in_warehouse | warehouse_putaway |
| warehouse_processing | receiving_activity |
| allocated | distribution_allocation |
| distribution_en_route | outbound_shipping_notice |
| retail_available | retailer_availability_notice |
| delayed | shipping_exception |

A product page, queue or third-party guess cannot prove a purchase order,
shipment, receipt or warehouse putaway. Unknown is manual, not a verified
warehouse state. No facilities, shipment IDs, routes, POs, exact quantities,
supplier staff data, or vendor schedules are accepted or published.

## Classification and persistence

Every event must match an enabled SKU watch target and its registered retailer
product URL. Unknown SKUs, wrong retailer URLs, expired timestamps, unexpected
fields, unapproved stages, weak/invalid signatures and disconnected sources
are rejected. Nothing in the event can choose another retailer, grant
permissions, mark the source live or set an exact stock count.

- Official API: after genuine source validation, a product event may be
  marked official; purchase availability expires within 15 minutes and is
  hidden when source health becomes stale.
- Authorized third-party feed: a reported available-now claim is downgraded
  to reported_stock and is **not** called confirmed buyable inventory.
- Warehouse proof: a permitted event is stored in the staff-only inbound
  table and is never converted into a public restock.
- Replay: a stable SHA-256 key made from source ID, SKU and provider eventId
  is protected by existing unique database constraints. Replays do not
  create additional alerts.
- No Discord or app push is sent by this endpoint. Adding outbound delivery
  needs separate opt-in, quiet hours, unsubscribe, rate limiting, review,
  deduplication and delivery audits.

## Deployment and tests

The new function exists only in the GitHub draft PR. It has not been deployed
to the hosted production Supabase project. Because external systems use
signed HMAC rather than a Supabase user JWT, its gateway needs
verify_jwt=false only when the internal signature/authentication check is
deployed and reviewed. No wildcard CORS is permitted; this is not a browser API.

Run the project checks plus:

    npm run test:stock-source-intake
    npm run test:stock-intelligence
    npm run lint:src
    npm run build

Synthetic integration tests cover signed source → approved SKU → private
write → filtered public feed, replay, clock skew, bad signatures, false
availability, product URL mismatches and warehouse-stage permissions.

Before activation: test isolated staging database and provider credentials,
review a real authorized payload and redistributable rights, verify the
source-health implementation, and confirm no member can read private
warehouse rows. Only then approve deploying the source function and adding
a single provider registration. Do not automatically merge or promote PR #50.

**Current blocker:** no approved external retailer/supplier agreements,
keys, warehouse feeds, or permitted source registration has been supplied.
The code is deliberately inert until those arrive.
