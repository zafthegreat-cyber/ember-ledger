# UI and catalog checkpoint — November 14, 2026

This feature-branch checkpoint includes the implemented UI improvements 101–200, photo-assisted catalog lookup, graded-copy details, catalog tilt and inspection refinements, and the verified catalog photography and barcode work completed so far.

## Catalog coverage

- 89 unique complete six-sided box models (90 catalog entries, including one alias), one rotating wrapper, and 19 photo galleries.
- 1,910 exact card-printing identities with reviewed special backs; seven exact front-photo fallbacks for unavailable provider images.
- 897 barcode evidence entries. Shared retail codes show a choice of matching variants instead of silently selecting one.
- The latest source batch added 20 complete boxes and 804 barcode identities. Manufacturer and matching retail source details and original-image hashes remain alongside the mappings.
- The latest ten mini-tin entries have photographed fronts and backs. They remain photo galleries; missing edges are not fabricated.

This is an incomplete catalog checkpoint. Of 3,843 physical-packaging entries, 3,752 still need complete verified imagery and 2,215 lack a usable barcode. These counts overlap, and some retail identifiers may not apply to individually sold products. 409 card records still need back review. Existing front URLs do not prove that every remote image loads or is sharp.

## Validation

- 336 passing local UI, inventory, restock, sync, backup and account regression checks across 75 files.
- 80 passing inspection regressions, 122 passing feature regressions, and 30 passing display/motion checks. These suites overlap with the broader run and must not be added as a unique-test total.
- Production build passed. 595 packaging face references and 41 card artwork assets passed the referenced-asset checks.
- Phone-size and desktop browser previews inspected. The latest six-sided box controls and mini-tin galleries were checked in the actual viewer. Physical phone sensors were not exercised.
- Fixed a verified image transition bug: a newly available ordinary image no longer inherits the previous photographed fallback's projection matrix or dimensions.
- Corrected four outdated test harness imports/environment dependencies while preserving assertions.

Existing warnings remain: one `checkUser` effect-dependency warning, large build chunks/ineffective dynamic imports, module-type notices and two React test `act` notices.

## Data and publication

No collection records, purchases, sales, live database, synchronization state, or price refresh was written. The five generated catalog/price files match the original checkpoint hashes and are excluded from this change.

Production main has newer security, community and price changes. This branch is based on the earlier reviewed UI checkpoint; it must be integrated with current main and checked before any production merge or deployment. Pushing this checkpoint does not publish it. Unreferenced research photos, local reports, credentials, build output and user records are excluded.
