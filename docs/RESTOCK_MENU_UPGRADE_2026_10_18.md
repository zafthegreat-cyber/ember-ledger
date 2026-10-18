# Restock and menu upgrade — October 18, 2026

Local changes on `codex/all-bot-integration-setup`, based on `986e8318ae0b60494f777643e31338cf681cfd25`. No commit, push, merge, deployment or store upload was performed. Existing local privacy, branding and native work remains in place.

## What changed

- The menu has a compact **Report a restock** action, plus searchable aliases for stock, empty shelves and sightings. It opens the existing report flow and returns keyboard focus to the persistent menu opener on cancellation. Quick Add, the four existing shortcuts, workspace selection and Back behavior remain available.
- App supplies the report action only outside guest preview; the presentation cannot manufacture a destination absent from its permitted inputs. Existing report validation, guest/guess restrictions, duplicate-save protection and authority remain in the existing handlers.
- The ordinary report form offers up to three local catalog matches with reference images, names and set/type details. A selected match can be cleared; editing its name or changing category clears its linked catalog metadata. Free-text and category-only reports remain supported.
- Catalog artwork is explicitly a **reference image**, separate from an uploaded observation/proof photo. Choosing a match does not fill prices or proof fields. Missing/failed thumbnails use a small neutral card outline; a changed image reference remounts the thumbnail so an earlier error cannot hide a later valid image.
- The saved screen has one secondary **Add details** action and one fixed primary **Done** button. It distinguishes a device-only save from a save to the account without treating cloud storage success as proof of community publication.

No authentication, permissions, database model, cloud-sync/recovery protocol, integrations, remote execution controls or deployment settings changed.

## Verification

- Production web build and complete source ESLint passed again after the final thumbnail refinement. Existing large-file/chunk and dynamic-import notes remain non-failing build/tool warnings.
- Report date/time and save-flow checks, Quick Add routing, adaptive item ordering (16 cases), catalog shorthand/recovery, product display (19 checks) and menu full-page route checks passed.
- Actual report flow passed at **320, 390 and 1440 pixels in both themes**. Checks include matching/clearing/reselection, free text/category-only reporting, Back retaining the draft, no lookup API calls, no record writes before Save, one new report after duplicate submit, existing-record preservation, fixed actions, 44px controls and 200% text on the narrow dark screen.
- Three additional gallery contexts and a final 390px dark failure/recovery run passed. The final run checks the original failed image URL stays unchanged, the fallback is visible and selecting a valid image recovers. The new picker and saved-state screenshots were visually inspected.
- The actual menu passed its six width/theme cases, covering search/keyboard navigation, focus trap/return, touch targets, report entry/cancellation, existing destinations, Back and data preservation. The standalone restricted-input fixture and actual guest-menu checks also passed. Guests had no report destination in shortcuts/search and attempted no writes. Final manifest: `artifacts/qa/menu-restock-upgrade/results-320-390-1440.json`.
- Membership menu regression passed at 320px dark, 390px light and 1440px dark across all five tier previews. Private destinations stayed hidden in ordinary previews; the actual role/records were preserved and admin tools returned after preview ended.
- Restock entry regression passed at 320px dark, 390px dark and 1440px light, including `/find/restocks`, community browse/refresh, reporting and Back without record changes.
- The older `test:accessibility-keyboard` source contract fails on `aria-label="Bot Operations safety state"`. That exact label is also absent in committed HEAD's Bot Operations component. This upgrade does not change the bot component or weaken that test. The changed report/menu keyboard behavior is covered by the actual browser checks above.
- No root `typecheck` or generic `test` script exists; the available targeted scripts and full source lint/build were used. No new TypeScript or backend code was added.
- Final `git diff --check` passed. A separate read-only review found no actionable blocker in the new menu/report sections.

Browser tests used disposable loopback contexts and synthetic records with external requests and server mutations blocked. No real account, mailbox, production record or phone installation was used. The temporary Vite server on port 5258 was stopped after verification; it does not remain as an additional workspace-directory lock.

## Data and release boundaries

All **14 generated catalog files** are byte-identical to the start of this upgrade, retaining the latest bundled prices. Branch/HEAD are unchanged. APK/AAB hashes still match verified Android build 6; those packages have not been rebuilt and do **not** contain this newer UI. iOS assets were not synchronized for this upgrade. Real cloud posting, cross-device catalog-image persistence, physical-phone behavior and native distribution remain unverified.

## Evidence

- `artifacts/qa/everyday-restock-upgrade/`: baseline, preservation hashes, final build/lint logs, membership menu results and restock-entry results.
- `artifacts/qa/restock-catalog-upgrade/`: six-context report results, gallery checks and final `fallback-recovery/` results/screenshots.
- `artifacts/qa/menu-restock-upgrade/`: menu checks, screenshots and final run evidence.

See [mobile beta readiness](./mobile-beta/READINESS.md) for the separate native/account-service submission gates. The workspace folder rename remains subject to the previously documented Windows lock; this UI work did not retry it.
