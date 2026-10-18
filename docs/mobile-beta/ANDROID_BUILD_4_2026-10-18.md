# Android build 4 — public-listing location correction

Build 4 includes the final privacy/support policy and removes automatic public-listing location defaults drawn from a saved private home/GPS location. Existing listings and saved drafts retain their values. Base commit `986e831` plus the reviewed local changes; version **1.0.0**, build **4**, app ID `app.code3tcg.mobile`, minimum API 24 and target API 36.

| Local package | SHA-256 |
| --- | --- |
| `artifacts/native/Code3TCG-debug.apk` | `c7e213a946e7a77f4ad137fe0ce2faaa33739ede1c75296ea3edc83c81d9d5fb` |
| `artifacts/native/Code3TCG-beta.aab` | `73da52b13dd5c968ac62be5b1dec1e4af3bbd4e89ac289294d79f6182b6c2d48` |

The APK is debug-signed for device testing; the AAB uses the same existing upload key and has not been uploaded. Build 3 packages and evidence were archived and hash-verified before replacement. Builds 1–3 remain under their `artifacts/native/buildN-archive` directories.

Verified results:

- Release build **228** Gradle tasks; debug/unit task **199**; both manifests report build **4**. The generated unit example is not a functional phone test.
- APK signature verification passed. AAB `jarsigner`, all **623** signed payload entries against the unchanged upload certificate, and bundletool **1.18.3** validation passed.
- All **175** web assets inside both packages byte-match the configured native build. Local phone preflight reports **zero failures**.
- Native **19** behavior scenarios plus App export regression, **18** marketplace private-location/saved-edit scenarios, frontend lint and web build passed. The broader existing `test-marketplace-listings.mjs` suite has a pre-existing stale assertion confirmed before this change; it is not claimed as passing here.
- iOS assets synchronized. SPM/Gradle generated files retain relative paths with no substantive diff. No build-4 iOS compilation/signing or physical-phone acceptance was performed.

Current evidence is in `artifacts/native/release-verification.json`, `package-web-assets-build4.json`, `phone-preflight-build4.json` and the referenced `*-build4.log` files. Existing large-bundle/dynamic-import/Babel/Gradle warnings remain non-failing.

No generated prices, existing account data, production settings, commits, pushes or store uploads changed during this refresh. Latest hosted CORS evidence remains the earlier read-only check: native origins are not yet accepted. Hosted privacy/deletion rollout, exact Auth callbacks, signed TestFlight delivery and physical-device data comparison remain required. Follow the [phone quickstart](./PHONE_TEST_QUICKSTART.md) while preserving the PWA and verified transfer files.
