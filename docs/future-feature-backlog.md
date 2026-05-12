Current sprint focus remains beta stability, Scout Quick Report, catalog repair, mobile cleanup, and backend/RLS safety. Items in this file are parked future features unless moved into the active sprint.

## Branding Direction

This is user-facing naming direction only. Do not rename routes, database names, table names, migrations, RLS policies, or internal code symbols until a separate refactor is approved.

| Branded section | Former/current section | Bottom nav label | Scope |
| --- | --- | --- | --- |
| Tide Watch | Scout / restock intelligence | Watch | Drop Radar, store reports, Quick Report, calendar, predictions, and restock intel |
| Tide Vault | Vault / personal collection | Vault | Cards, sealed collection, wishlist, master set tracking, and owned items |
| Ember Exchange | TideTradr / Market | Market | Prices, deals, listings, market values, watchlist, and trade value |
| The Hearth | Forge / business | Hearth | Business inventory, sales, expenses, mileage, receipts, reports, and marketplace tools |
| Tidepool | Community | Pool | Posts, questions, sightings, events, replies, and confirmations |

Page titles should use the full branded names: Tide Watch, Tide Vault, Ember Exchange, The Hearth, and Tidepool. Bottom navigation should use the short labels: Watch, Vault, Market, Hearth, and Pool.

## 1. Future Scout Features

Scout should become a durable drop and restock intelligence system.

- Durable Supabase-backed Scout reports
- Quick Report with receipt, screenshot, Facebook/text/Discord screenshot, stock photo, shelf tag, manual note, and link/text proof
- Report proof privacy controls
- Report edit history
- Users can add details later
- Users cannot delete reports; they can retract, mark mistaken, or request removal
- Admin can verify, hide, restore, soft-delete, merge, and dispute reports
- Store reports feed predictions and confidence scores
- Confidence scoring based on recent confirmations, receipt proof, photo proof, user count, admin verification, no-stock reports, historical patterns, and stock signals
- Store-specific restock history
- Last confirmed stock
- Last confirmed no-stock
- Stock left after purchase field
- Needs Store Review workflow
- Needs Product Review workflow
- Missing store report workflow
- Missing product report workflow
- User report reputation/trust score later
- Duplicate report detection
- Quick Report from calendar events
- Quick Report from Drop Radar
- Quick Report from store cards
- Quick Report from Home Today's Watch

## 2. Future Calendar Features

Pokemon Watch Calendar should become a full month/week/agenda calendar.

- Real month calendar view
- Users can scroll forward/back by month
- Users can jump to a future month
- Users can see future drops/releases far ahead
- Tapping a date opens that day's agenda
- Tapping event opens event details
- Admin can add/edit future events
- Users can suggest future calendar events
- Official Pokemon release dates
- Expansion release dates
- Preorder dates
- Online restock watches
- Local restock predictions
- User guesses
- App predictions
- Admin verified events
- High-confidence events
- Military store layer
- Area/city filters
- Multiple city/region selection
- Calendar event reminders
- Notify Me button
- Export to Google Calendar later
- Subscribe to calendar feed later
- Calendar import from official/source links later
- Upcoming Releases module on Home
- Today's Watch module on Home
- This Week summary
- No fake events; only real/admin-entered/imported data

## 3. Future Catalog / TideTradr Features

TideTradr should become a clean searchable, catalog-driven experience.

- Clean All / Cards / Sealed / Code Cards / Supplies toggle
- Code cards classified as code cards, not sealed
- Code card detail pages
- Related sealed product relationship for code cards
- Larger catalog images
- Tap/click image to enlarge
- Better card detail page
- Better sealed product detail page
- Admin Catalog Repair Mode
- Missing image repair
- Wrong image reporting
- Admin image approval
- Catalog duplicate detection
- Merge duplicate catalog items
- Missing product workflow
- Failed search logging
- Set/expansion search
- Product type search
- UPC/SKU/retailer SKU search
- Shorthand search
- Typo/fuzzy search
- Known aliases
  - pe / pr evo = Prismatic Evolutions
  - ss = Surging Sparks
  - 151 = Scarlet & Violet 151
  - cz = Crown Zenith
  - es = Evolving Skies
  - etb = Elite Trainer Box
  - pc etb = Pokemon Center ETB
  - upc = Ultra-Premium Collection
  - bb = Booster Box
  - bundle = Booster Bundle
  - 3pk = 3-Pack Blister
  - b&b / bnb = Build & Battle
  - sir = Special Illustration Rare
  - ir = Illustration Rare
  - rh / rev holo = Reverse Holo
- Variant only for cards
- Cards do not show MSRP
- Sealed products show MSRP/UPC/SKU
- Code cards do not show sealed-only fields unless linked to a sealed product
- Card master set progress
- Variant tracking
- Duplicate tracking
- Condition tracking
- Graded/raw tracking
- Certification number tracking
- Set progress by cards owned
- Sealed collection tracking
- Wishlist integration
- Forge/Vault integration
- Market price history
- Price source tracking
- Missing market data dashboard

## 4. Future AI Features

AI should reduce friction, not replace user control.

- AI receipt intake
- Receipt creates Scout report automatically
- Receipt stages items for Vault/Forge/Split/Expense/Ignore
- AI product matching from receipt text
- AI screenshot/photo lookup
- Identify cards
- Identify sealed products
- Identify code cards
- Identify shelf tags
- Read UPC/SKU/TCIN
- Read Facebook/text/Discord screenshots
- Suggest store/location from screenshot or receipt
- Suggest report type from messy intel
- Clean messy notes into structured report
- Detect duplicate/missing products
- Suggest catalog match
- Suggest missing product fields
- Admin intel summarizer
- Summarize raw reports into short public intel
- Suggest confidence level
- Suggest whether report should trigger alert
- AI should always require review before saving universal data
- AI should not auto-alert regular users without admin/rule approval
- AI should not auto-buy
- AI should not bypass retailer systems
- AI should not publish public data without review

## 5. Future Alerts / Notifications

Alerts should follow durable data + explicit user consent.

- In-app notifications
- Push notifications
- Text alerts
- Email alerts
- Text alerts require explicit opt-in
- Future alert types
  - Drop confirmed
  - Drop predicted soon
  - Stock changed
  - Queue opened
  - New release added
  - Favorite store changed
  - High-confidence admin alert
  - Watched product changed
  - Receipt-confirmed stock
  - Calendar event reminder
  - Store report verified
  - Local restock window approaching
  - Online drop watch changed
- Future alert preferences
  - Favorite stores only
  - Specific retailer
  - Specific product
  - Specific TCG
  - City/region radius
  - High confidence only
  - Confirmed drops only
  - Admin verified only
  - Quiet hours
  - Push opt-in
  - Text opt-in
  - Email opt-in
- Do not blast everyone from weak reports
- Alerts should require recency + confidence + user opt-in
- Old screenshots should update history but not trigger live alerts

## 6. Future Store / Retailer Intelligence

Scout should support richer store-level intelligence with safe, auditable data.

- All Virginia supported stores
- Hampton Roads default
- Store nickname support
- Store favorites
- Store correction suggestions
- Missing store suggestions
- Admin store approval
- Duplicate store detection
- Store coverage audit
- Store profiles
- Known restock day/time
- Known truck/vendor day
- High-volume/low-volume classification
- Store history
- Store confidence score
- Store report count
- Store last confirmed stock
- Store last confirmed no-stock
- Military-access stores
- AAFES / Exchange
- NEX
- MCX
- CGX
- DeCA Commissary
- Shoppette / Express
- Base access warning
- Show military-access stores setting
- No gate/security/ID/restricted-area reporting
- Future retailer intelligence
  - Best Buy authorized/public stock signal checks
  - Lowe's authorized/public stock signal checks
  - Walmart online watch
  - Target online watch
  - Sams/Costco/BJs online watch
  - Pokemon Center watch
  - Admin-only autopilot monitoring
  - Regular-user request-a-pull summary
  - Store-level availability where allowed
  - Pickup availability where allowed
  - Next-day availability where visible and allowed
  - Quantity only if legally/technically visible
  - Signal logs
  - Change detection

## 7. Future Tidepool / Community Features

Tidepool should become the social layer for community intelligence.

- Create post
- Ask question
- Share sighting
- Share event
- Share giveaway
- Share store intel
- Comment/reply threads
- Save posts
- Flag posts
- Verified posts
- Region/store tags
- Event posts
- Question posts
- Sighting posts
- Post status
  - Open
  - Answered
  - Resolved
  - Completed
  - Expired
  - Archived
  - Disputed
- User can mark own post resolved/completed/expired
- Admin moderation menu
- Admin verify/hide/archive/lock comments/dispute/delete
- Soft-delete posts
- Admin view deleted/hidden posts
- Nearby posts
- Verified posts
- Saved posts
- Mine filter
- Tidepool tied to Scout reports later
- Tidepool event tied to Calendar later

## 8. Future Donations / Kids Program Features

Planned donation and kids distribution capabilities.

- Donations page
- Kids packs
- Free giveaways
- Low-cost kid surprise boxes
- Community events
- Starter kits
- Event prizes
- Accepted donations
  - Bulk Pokemon cards
  - Holo/reverse holo cards
  - Energy cards
  - Trainer cards
  - Code cards if useful
  - Sealed Pokemon packs
  - Sealed booster packs
  - Sealed sleeved boosters
  - Sealed blisters
  - Sealed 3-pack blisters
  - Sealed mini tins
  - Sealed tins
  - Sealed collection boxes
  - Sealed EX/V/VSTAR boxes
  - Sealed promo boxes
  - Sealed ETBs
  - Sealed booster bundles
  - Sealed Build & Battle boxes
  - Sealed decks
  - Sealed holiday calendars
  - Sealed retail bundles
  - Other sealed TCG products
  - Sleeves
  - Dice
  - Coins
  - Damage counters
  - ETB boxes
  - Stickers
  - Plushies
  - Pokemon books
  - Gift bags
  - Party favor bags
  - Shipping/packaging supplies
- Donation form
- Donation photos
- Donation status workflow
- Admin donation dashboard
- Impact stats
- Kids packs made
- Giveaways completed
- Cards donated
- Supplies donated
- Events supported
- Donation inventory
- Kids Pack Inventory
- Giveaway Supplies
- Donation Stock
- Donor privacy
- No nonprofit/tax-deductible claim unless configured
- Kids Program
  - Eligibility rules
  - Parent/family-friendly access
  - Sell some products at retail when inventory allows
  - Kids packs
  - Kid giveaways
  - Kid events
  - Prevent abuse/resale where possible
  - Household limits
  - Admin approval
  - Family/kid-friendly policies

## 9. Future Multi-TCG / Other Products

Prepared architecture for future expansion.

- Categories
  - Pokemon
  - Lorcana
  - Magic: The Gathering
  - One Piece
  - Yu-Gi-Oh!
  - Sports cards
  - Collectibles
  - Toys
  - Gaming
  - Other retail drops
- Short-term support
  - Manual add for other TCG/items
  - Category field
  - Card/sealed/code card/collectible/accessory field
  - Photo
  - Notes
  - Price
  - Quantity
  - Store reports
  - Basic filters
- Do not build full non-Pokemon catalogs yet
- Later full catalog support
  - Lorcana card database
  - Magic card database
  - One Piece card database
  - Yu-Gi-Oh card database
  - Sports card support
  - Other sealed products
  - Market pricing sources
  - Set/variant support by TCG

## 10. Future Paid / Business Features

Future business and monetization features once stability is proven.

- Subscription tiers
- Paid alerts
- Paid auto-open add-on
- Advanced Scout features
- Saved views
- Business/team sharing
- Shared workspace for business partners
- Role-based workspace permissions
- Multi-user inventory
- Cross-listing support
- Marketplace listing support
- Import sales from platforms
- Whatnot/eBay/Facebook/Instagram/TikTok sales tracking
- Profit reporting
- Expense reporting
- Mileage tracking
- Receipt scanning
- Inventory at home vs store
- Low stock warnings
- Needs listing
- Needs price review
- Marketplace reports
- P&L reporting
- Tax/category reports

## 11. Future Admin Tools

Foundation for reliable moderation and governance.

- Global Admin Edit Mode
- Inline edit controls
- Admin audit log
- Admin review queue
- Universal data suggestions
- Approve/reject/merge suggestions
- Store corrections
- Missing product approvals
- Missing store approvals
- Catalog Repair Mode
- Image review
- Duplicate merge
- Report moderation
- Prediction override/pin/reset
- Calendar event admin
- Donation admin dashboard
- Tidepool moderation
- User role management
- Workspace role management
- Store coverage audit
- Catalog coverage audit
- Failed search log
- RLS role test script
- Test DB validation checklist

## 12. Do Not Build Yet / High Risk

Not approved for current sprint.

- Auto-buy
- Bypassing queues
- Circumventing retailer bot protections
- Unauthorized retailer scraping
- Using private/internal retailer systems
- Paid auto-open for regular users
- Full retailer stock autopilot
- Deep AI automation
- AI auto-publishing
- AI-generated alerts without review
- Payment/checkout system
- Full public sponsorship payments
- Full multi-TCG catalogs
- Full VA store seeding before core flows are stable
- Production RLS migration apply before test DB validation
