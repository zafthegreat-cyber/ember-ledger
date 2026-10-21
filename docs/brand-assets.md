# Code 3 TCG brand assets

The October 2026 brand direction replaces the earlier C3 monogram, ribbon-shaped
3, orange/blue palette and fantasy presentation. Keep the website, app and bot
consistent with this direction while preserving their existing functionality.

## Approved direction and supplied artwork

The main emblem is **three fanned cards with gold stars**. Use that emblem alone
for app icons, favicons and the bot avatar. Use the full **CODE 3 TCG** wordmark
where space permits, retaining the reference's squared lettering and gold 3.
Do not substitute a C3 monogram, ribbon-shaped 3, bubbly lettering or Pokemon
character artwork.

The user supplied the separate approved PNG files. Unchanged copies are in
`public/assets/brand-system/artwork/`:

- `code3-emblem-icon.png` — 1254×1254 pixels.
- `code3-wordmark.png` — 2172×724 pixels.
- `code3-wordmark-on-dark.png` — 2172×724 pixels; supplied lettering for dark backgrounds.
- `code3-banner.png` — 2171×724 pixels.

Source/copy SHA256 hashes match. Do not invent or trace a replacement, crop a
whole brand sheet into a production asset, or treat retired files as approved.
`src/config/brand.js` points the app chrome, fallback, favicon, touch icon and
PWA to the supplied emblem. Desktop navigation uses the full supplied dark-background
wordmark, unframed on its maroon rail. Mobile Home uses the emblem with a readable
brand label. Promotional/link-header areas use the banner. `BrandIdentity` reuses
these references; it does not reconstruct or stretch the supplied lettering.

The web manifest declares the emblem's actual 1254×1254 PNG dimensions with
`purpose: any`. It does not claim 192/512px exports or maskable safe-area
verification. Legacy config field names remain compatible but point to the
same actual source. Retired files under `public/assets/brand/` remain unused by
these metadata/chrome references. Native binaries and mobile companion icon
exports are not regenerated or signed by this visual review.

## Shared palette and semantic tokens

The canonical tokens ship in `public/assets/brand-system/code3-tokens.css`.
They retain the shared website/app/bot palette. App compatibility mappings live
in `src/styles/theme.css`; app-specific visual refinements live in
`src/styles/brand-refresh.css`.

| Brand role | Color |
| --- | --- |
| Maroon | `#7A0F1E` |
| Purple | `#4B1B6B` |
| Charcoal | `#222222` |
| Cream | `#FBF4E6` |
| Gold | `#D4AF37` |

Use warm cream/charcoal surfaces, subtle maroon/purple decoration and restrained
gold accents. Keep foil and sparkles in decorative brand areas. Controls and
data use solid semantic colors with readable contrast. Light actions use maroon
with white text; dark actions use accessible light gold with dark text. Preserve
the user's existing theme preference. Pair status colors with labels/icons and
retain distinct success, warning, error and information states.

The final app refinement uses cream surfaces and maroon navigation in light mode,
charcoal page/panel surfaces in dark mode, restrained maroon/purple accents and
gold restock/chrome actions. Dark page/panel colors are `#141619` / `#202328`.
The shared tokens and separate website/bot projects are unchanged by this app
release. Sixty solid role pairs pass the approved palette contrast audit, with
tested text contrast at least 5.38:1.

## Interface typography and licensing

- Headings: **Chakra Petch SemiBold (600)**.
- Body text, forms and tables: **DM Sans variable (100–1000)**.
- Technical logs may retain an existing readable monospace font.

Both fonts are self-hosted in `public/assets/brand-system/fonts/`, unmodified,
with their SIL Open Font License 1.1 files alongside them. Source distributions:
[Chakra Petch](https://github.com/google/fonts/tree/main/ofl/chakrapetch) and
[DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans). These are
interface font choices. The font in the flattened supplied wordmark PNG is
unknown; the approved image is retained. Do not stretch letters or use display typography
for all body copy.

## October 21 app release

Keep keyboard focus visible, touch targets at least 44px, product photos
recognizable, and responsive layouts free of clipped text. Respect reduced
motion. Browser release checks use fresh synthetic-only contexts, block external
requests and do not sign into owner accounts. Their screenshots and results are
under ignored `artifacts/qa/`; physical phone testing is recorded separately.

The owner authorized publication of the app color changes on October 21. The
isolated release branch is `codex/app-colors-release-20261021`, based on latest
pricing commit `add077ccd8e7cbfc13ec6de95ce821c5f1289f2a`. Only appearance files,
approved assets, branding metadata and focused test/documentation changes are
included. Unpublished free-feature, restock, upload, sync, security and eBay work
from the broader review remains separate.

The mixed JSX presentation changes retain all existing hooks, calculations,
callbacks, controlled values and guards. Authentication, persistence, backup,
sync, restock, native, API and pricing code are unchanged. All 14 generated data
files match the release baseline. No schema migration or production data write
is needed. Preserve existing storage keys and theme preferences.

The unused legacy `scripts/export-code3-pwa-icons.mjs` expects an SVG source and
rejects the new PNG before writing. It is outside the build/release path and
must not be used to overwrite the approved artwork. This web/PWA release does
not generate maskable icon exports, signed native packages or store submissions.

No trademark clearance or new artwork rights are established by these previews.
Keep existing product-image provenance and licensing limitations. Code 3 TCG is
not affiliated with or endorsed by The Pokemon Company, Nintendo, Game Freak or
Creatures.
