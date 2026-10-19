# Easier stock reports and private screenshot import

October 19, 2026. The existing restock report now has a shorter Store → What you saw → Review flow. A person can report a store visit or choose a Facebook, Discord, or other screenshot without connecting their social account.

These changes remain local and uncommitted on `codex/all-bot-integration-setup`, based on `11f58ad3378c0d065f939372bfaa1e686dfd979c`. The preceding collection, portfolio, Sets, and multi-game work remains intact. No commit, push, merge, deployment, production database write, account change, or price refresh was performed for this update.

## Reporting flow

The normal report shows the selected store and observed time, a short stock-status choice, and five game categories. Product lookup, notes, extra categories, proof, and price details remain available in disclosures. Review keeps the store/time, status/products, and sharing visible; source and additional context remain available. The existing exact-store confirmation, guest restrictions, duplicate-save lock, awaited cloud save, local fallback, and full record navigation are retained.

Home, the global Add menu, Scan Anything, and Scout screenshot shortcuts reach the same modern importer. Nested Add navigation keeps the existing dirty-draft confirmation. The old screenshot renderer and saved records remain compatible but new screenshot shortcuts no longer depend on the experimental browser TextDetector path.

## Screenshot behavior

Choose a JPG, PNG, or still WebP up to 12 MiB. The reader runs on the device using pinned Tesseract.js 7.0.0 and an English model. Its worker, engine variants, model, and licenses are prepared from installed dependencies into generated `/ocr/` files by the development, web-build, and native-build hooks. There is no remote OCR service, API credential, social login, scraping, or screenshot upload.

The image is checked before decoding, with bounded dimensions, working canvas size, text length, and execution time. Replacement, cancellation, typing during recognition, and unmount invalidate stale work and terminate workers. A failed, unsupported, blank, or cancelled image leaves manual/pasted-text entry available. Image previews use temporary object URLs, released when removed or closed.

Suggestions use bounded recognized game/product names and known store candidates. They do not copy authors, private conversation, contact information, URLs, or instructions into a report. The exact store is never selected automatically, and screenshot clocks or relative post dates never become the observed time. The person explicitly reviews stock status and confirms when the stock was seen before applying the patch. Conflicting, speculative, or unrecognized claims require manual review.

Applying suggestions fills empty fields and the untouched initial stock default. Entered store, product, category, and status choices stay unless the person deliberately chooses replacement. Confirmed manual locations, user notes, and proof photos are preserved. Replacing a product clears its old catalog ID, snapshot, name, set, type, and reference artwork. Reviewed product text is retained through the existing 1,200-character intake limit; longer text is rejected with a clear message instead of silently truncated. Applying the observed time selects an explicit date mode so a historical report cannot silently become today's report.

Applying creates only a draft. The original image, file name, raw text, and OCR confidence are not attached or saved. New screenshot reports start private from the public map and require review. Sharing can be deliberately changed on the final review screen. Status/proof edits cannot turn an imported screenshot into firsthand evidence; the source and review state remain separate from OCR text-reading confidence. Existing moderator confirmation remains available through the original authority model.

Cloud mapping preserves the screenshot source, proof label, controlled platform label, sharing selection, and review state. If a server lacks the modern source/sharing columns, screenshot reports retain the local copy and show a save failure rather than retrying a legacy insert that could discard privacy metadata. Ordinary report fallback behavior remains intact. No schema, RLS, permissions, authentication, or deployment configuration was changed.

## Verification and limits

Production web build, full source ESLint, and native web smoke build passed. Existing non-failing Vite large-chunk/dynamic-import, Babel large-file, and Node module-type notices remain. There is no frontend typecheck script. The native smoke bundle deliberately has no account configuration; it is not a signed or distributable package.

The new local checks cover 15 OCR safety scenarios, 43 parsing/patch scenarios, and 13 behavior groups executing actual App cloud functions with a mocked Supabase query chain. Existing save-flow, date/backfill, Quick Add routing, Scout reputation, 29 restock history scenarios, 23 native runtime scenarios, and native export checks passed. No live cloud insert was used to test this feature.

Actual-app browser checks use disposable records at 320, 390, and 1440 pixels in light and dark themes. They exercise genuine local OCR from synthetic Facebook-style and Discord-style images, exact-store/time guards, final-only save, private provenance, status/proof edits, cancel/error/paste handling, keyboard focus, 44-pixel targets, and narrow-screen text enlargement. Existing report and store-handoff browser regressions exercise catalog reference matching, proof attachment/removal races, Back/edit preservation, manual/future-time guards, and record/return/history behavior. Phone navigation checks cover ordinary and admin cancellation paths.

A separate nine-case OCR harness loaded the untouched worker, engine, and language files from the production preview and verified their SHA256 hashes against built files. It injected only the utility module into an empty synthetic page; it did not authenticate or bypass the production app. The attempted synthetic full-app production run correctly stopped at sign-in. Actual-app end-to-end coverage uses the existing loopback development identity, with network writes blocked.

All fourteen generated catalog files retain their original SHA256 hashes. Browser checks preserve the original synthetic stores, reports, collection, sales, expenses, sightings, and prices, permitting only one deliberately saved disposable report. The real owner's holdings were not opened or changed.

English text recognition works best with one cropped, readable stock post. Unsupported files, poor images, product names outside the recognized suggestions, uncertain stores, and missing observation times still require manual entry. Physical iPhone/Android hardware, native WebView OCR, signed packages, real social screenshots, and authenticated production cloud saves have not been verified. The production account guard remains intact.

## Evidence

- `artifacts/qa/stock-screenshot-import/final/results.json` — six full-app screenshot cases and screenshots, including direct Add/Scan Anything entries.
- `artifacts/qa/scout-screenshot-ocr/results.json` — standalone genuine OCR/error/cancel cases.
- `artifacts/qa/scout-screenshot-production-assets/results.json` — nine production-asset OCR cases and verified asset hashes, without production account access.
- `artifacts/qa/stock-report-easy-regression/final-v2/results.json` — ordinary report regressions, including source-label contrast.
- `artifacts/qa/stock-report-store-handoff/final/results.json` — four store navigation/handoff cases.
- `artifacts/qa/stock-report-phone-navigation/results.json` — twelve ordinary/admin navigation cases.
- `artifacts/qa/stock-report-build-final.log`, `stock-report-lint-final.log`, `stock-report-lint-changed-final.log`, and `stock-report-native-build.log` — build/lint evidence.
- `artifacts/qa/stock-report-catalog-after.json` and `stock-report-ocr-build-assets.json` — data and packaged OCR asset comparisons.

Completion manifest: `artifacts/qa/stock-report-completion.json`.
