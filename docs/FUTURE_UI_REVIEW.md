# Code 3 TCG — precision interface refinement

Date: 2026-09-15. Local review candidate; no commit, push, merge, or deployment.

This pass builds on the completed layout and semantic-theme work. The checkout remains detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`, associated with `ui-104-final-product-ui-2`. Earlier Account Ops and UI work remains in the uncommitted working tree.

## Direction and references

The requested “almost futuristic” character comes from typography, precise alignment, layered neutral surfaces, and restrained teal details. The agreed light and dark palettes are unchanged.

- **Quieter navigation, clearer content hierarchy:** Linear's current refresh describes reducing the visual prominence of sidebars, making tabs compact, and softening separators. This informed Code 3 TCG's shared shell and Find tabs. [Linear, March 2026 interface refresh](https://linear.app/now/behind-the-latest-design-refresh)
- **Collectibles and recorded values first:** Collectr's tracking interface emphasizes portfolio totals, product information, and accessible filters. This informed the Collection metrics and product-row hierarchy. [Collectr tracking](https://getcollectr.com/track)
- **Distinct action hierarchy:** Raycast's action panel distinguishes a primary action from grouped supporting actions. This informed the existing controls and grouped Settings presentation, without adding new shortcuts or capabilities. [Raycast Action Panel](https://manual.raycast.com/action-panel)

These are design interpretations of official product references, not copied interfaces or assets. Competitor live interfaces were not browser-verified; Code 3 TCG's implemented screens were.

## Implemented

- Shared heading typography uses a locally hosted Space Grotesk variable font. Body text retains a system sans-serif stack; compact metadata uses a system monospace stack. The font is 136,676 bytes, weights 300–700, with `font-display: swap` and fallback fonts. The full SIL Open Font License is bundled beside it. [Official Google Fonts source](https://github.com/google/fonts/tree/main/ofl/spacegrotesk)
- Central semantic tokens now include inset/navigation surfaces, subtle panel shadows, edge accents, and typography. There is no external font request at runtime.
- The sidebar and topbar recede visually; selected navigation receives a precise edge marker. The mobile Add control uses the same compact shape language while retaining its position and touch target.
- Home has an original decorative collectible-card SVG, recessed artwork area, small technical labels, clearer action indicators, and a compact mobile composition. Real attention/opportunity/activity/summary content is retained.
- Settings keeps its grouped structure and adds a more defined identity panel, inset metadata, restrained icon holders, and clearer expanded and selected controls. Existing preferences, notifications, routes, and Back behavior remain.
- Collection gains compact quantity/value panels and more prominent product thumbnails. Empty, filtered, and unassigned states remain distinct.
- Business has clear numbered stages for purchases, inventory, and sales, followed by Money and Compliance. These numbers are presentation labels, not new workflow steps.
- Find uses compact aligned tabs, clearer source metadata, refined empty-state surfaces, and 44px mobile Review buttons. A mobile tab-padding specificity conflict found during review was corrected.

No business rules, auth, permissions, schemas, integrations, remote-execution safeguards, deployment settings, or bot-specific operational layouts changed.

## Verification

| Check | Result |
| --- | --- |
| Final frontend production build | Passed; existing large App bundle warning remains |
| Backend TypeScript `--noEmit` | Passed |
| Semantic theme browser suite | 20/20 passed; exact palettes, saved themes, primary actions and dialogs |
| Workspace identity, workspace contracts, route loading, full-page routes | Passed |
| Keyboard/reduced-motion contracts | Passed |
| Focused Home browser verification | Six viewport/theme combinations plus eight shortcut navigations passed |
| Focused Settings browser verification | Passed at 390/1440 px in both themes: four disclosures, keyboard, notifications, nine destinations and Back, saved dark preference after reload |
| Focused workspace navigation check | Passed |
| Full beta regression | 28/28 scenarios passed |
| Viewport matrices | 46 light + 46 dark checks passed across mobile, tablet and desktop |
| Account Ops synthetic browser suite | Five scenarios / 926 assertions passed, including mobile/light and desktop/dark surfaces |
| Final Find and Collection checks | Find labels and More passed at 360/390 px in both themes; 12 Home/Collection scenarios passed for font loading, filter recovery and unassigned record guidance |
| Final 360px metric alignment | Both themes passed: quantity/value panels share a row, labels and values fit, More remains 44px tall |
| Changed-module ESLint | Not clean: JSX reference tracking is absent from the current configuration, and existing ref/effect diagnostics remain. No added non-unused diagnostic rule/message/count compared with HEAD. Raw results and comparison are recorded. |
| Diff whitespace check | Passed |

Tests use disposable synthetic local sessions. Physical devices, screen readers, and production behavior were not tested in this pass. No hosted integration was activated.

## Evidence and local preview

- [Home, dark desktop](../artifacts/qa/future-ui/home-dark-1440.png)
- [Home, light desktop](../artifacts/qa/future-ui/home-light-1440.png)
- [Home, mobile](../artifacts/qa/future-ui/home-light-360.png)
- [Settings, dark desktop](../artifacts/qa/semantic-theme/dark-1440-settings.png)
- [Business, light desktop](../artifacts/qa/semantic-theme/light-1440-business.png)
- Logs and additional screenshots: `artifacts/qa/future-ui/`; full app viewport captures remain in `artifacts/qa/viewport-guard{,-dark}/`.

Review the running app at `http://127.0.0.1:5217/?betaLocalMode=true`. The current candidate remains local for review.
