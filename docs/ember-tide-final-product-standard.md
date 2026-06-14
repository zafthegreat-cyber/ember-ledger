# Ember & Tide Final Product Standard

Ember & Tide is a warm premium collector command center.

It is not a beta dashboard, shopping cart, public social feed, admin tool, or generic TCG tracker. Dark Hearth is the closest visual reference: compact, useful, warm, serious, and collector-centered. Every route inherits that base and uses only a small accent to clarify its job.

## Visual System

- Base mood: warm premium collector command center.
- Dark mode: ink, ember, brass, soft cream text, low-glare surfaces, clear card separation.
- Light mode: parchment, warm paper, ink text, brass/ember definition, never washed out.
- Accent rule: one route accent at a time. Accent supports hierarchy; it does not own the page.
- Card rule: one primary action surface first, supporting cards second, preview cards only when they change the user's next decision.
- Button rule: primary actions are ember/gold, secondary actions are quiet ink or parchment, route accents are reserved for context and active states.
- Pill rule: pills are short status labels, not paragraphs. Hide or collapse extra guardrails on mobile.
- Desktop rule: use the width intentionally with a main command column and compact support rail.
- Mobile rule: show the main action quickly, then tuck tools, rails, previews, and extra safety detail lower or into collapsed surfaces.

## Route Standards

- Hearth: short command center. Welcome, next best step, pulse stats, quick actions, recent activity, collapsed tools, one safety strip.
- Scout: proof-first local intel. The next action is scan proof, add report, or choose watched store. Teal is an accent, not the room.
- Vault: protected collection storage. Cards, sealed, binders, slabs, wishlist, set progress, and preservation should feel like the product.
- Market: manual research, not commerce. Search, compare, remember prices, and cite sources without checkout language.
- Forge: private seller ledger. Inventory, sales, costs, mileage, reports, and exports stay calm and businesslike without admin heaviness.
- Spark: parent-safe giving and kid packs. Warm, clear, and safe without neon or donation-page pressure.
- Tidepool: community notes, not a social feed. Private/local/beta language, proof labels, and moderation should feel quieter than social media.
- Ember Assist: friendly guide. It cannot imply a real AI backend unless the backend is live.
- Settings and Data Safety: calm utilities. No giant feature heroes, no oversized destructive buttons, no dock overlap.
- Auth: brand, promise, form, access note, quiet links. Form stays high on mobile.

## Implementation Contract

Use shared command primitives before route-specific CSS:

- `EtMockupPageShell`
- `EtMockupHero`
- `EtMockupSectionCard`
- `EtMockupActionCard`
- `EtMockupStatCard`
- `EtMockupRightRail`
- `EtMockupEmptyState`
- `EtMockupButton`
- `EtMockupPill`
- `FlowNextActionCard`

New route work should import the shared brand contract from `src/brand/emberTideBrand.js` and the command primitives from `src/components/command-system`. Do not add new late override blocks to `src/App.css` unless the rule is temporary and scheduled for extraction.
