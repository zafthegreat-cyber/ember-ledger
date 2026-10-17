# Code 3 TCG color refinement

Date: 2026-09-15. Local review candidate; uncommitted and unpublished.

The user requested cooler, more futuristic brand colors and delegated the palette choice. This update replaces the green-tinted neutrals with graphite and cool off-white, retaining the established teal accent. It builds on the completed layout refinement in FUTURE_UI_REVIEW.md. The checkout remains detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`, associated with `ui-104-final-product-ui-2`; preceding uncommitted work is preserved.

## Palette

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#F5F7FA` | `#10151C` |
| Card / input | `#FFFFFF` | `#1A222D` |
| Secondary surface | `#EEF2F6` | `#242F3C` |
| Inset | `#E9EEF3` | `#121922` |
| Elevated | `#FFFFFF` | `#273342` |
| Primary text | `#202A35` | `#F2F5F9` |
| Secondary text | `#5C6878` | `#ACB8C8` |
| Action | `#0F766E` | `#67C8BB` |
| Text on action | `#FFFFFF` | `#102C27` |
| Decorative border | `#DCE3EA` | `#344253` |
| Control border | `#7B8796` | `#7F91A6` |

Colors remain centralized in `src/styles/theme.css`. Explicit inset and elevated surfaces give panels and dialogs more separation. The document canvas now follows the app's saved dark preference. Remaining accent-button white foregrounds use the semantic foreground token, and the topbar Add icon inherits its button color without a competing inner tile. Existing status colors and theme preferences remain intact. No application behavior, authentication, permissions, integrations, remote safeguards, or deployment settings changed.

## Verification

- Final frontend production build passed; existing large bundle warning remains.
- Backend TypeScript `--noEmit` and theme-test syntax checks passed.
- Semantic theme suite: **30/30** route/theme/viewport combinations passed at 360, 390, and 1440 px. It checks all neutral surfaces against body/secondary/action/status text and control-border contrast, saved preference, outer canvas, primary-button foregrounds, touch targets, horizontal overflow, and Collection dialog focus.
- Viewport guard: **46 light + 46 dark** checks passed across mobile, tablet, and desktop routes, including login and global Add.
- Keyboard/reduced-motion contracts and focused workspace navigation checks passed.
- Independent contrast review passed: worst-case secondary text is **4.85:1 light / 6.37:1 dark**; control borders **3.13:1 / 3.97:1**; button labels **5.47:1 / 7.48:1**. Subtle borders are decorative.
- Existing UI ESLint remains non-clean: 91 errors and 3 warnings across the six previously refined modules. The baseline comparator reports zero added non-unused diagnostic rule/message/count; JSX reference tracking and existing ref/effect diagnostics remain. This color pass changed CSS and the browser test, not application JavaScript.
- Diff whitespace check passed.

Screenshots were visually inspected for light mobile Home, dark desktop Home, dark mobile Settings, light desktop Business, and dark mobile filters. Tests use isolated synthetic local browser sessions. Physical devices, screen readers, and production were not tested. The full 28-scenario business regression and Account Ops suite passed in the preceding refinement and were not repeated for this CSS-only application change.

The local Vite preview was restarted and verified by the isolated browser smoke test with no page errors, overlay, or overflow. The existing in-app tab retained a connection-error document that the browser tool's URL policy would not let it reload; an app-panel open request was queued. The local preview itself responds at `http://127.0.0.1:5217/?betaLocalMode=true`.

## Screenshots

- [Dark desktop Home](../artifacts/qa/color-review/dark-1440-home.png)
- [Light mobile Home](../artifacts/qa/color-review/light-360-home.png)
- [Dark mobile Settings](../artifacts/qa/color-review/dark-360-settings.png)
- [Light desktop Business](../artifacts/qa/color-review/light-1440-business.png)
- [Dark mobile filters](../artifacts/qa/color-review/dark-390-filters.png)

Additional current captures are in `artifacts/qa/semantic-theme/` and `artifacts/qa/viewport-guard{,-dark}/`. Final build output is `artifacts/qa/color-review/build.log`.
