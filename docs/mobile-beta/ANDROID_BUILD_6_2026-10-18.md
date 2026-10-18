# Android build 6 — Code 3 TCG filenames and package names

Build 6 contains the reviewed source-module, component-folder and public-artwork renames, updated imports/CSS, and `code3-tcg` app package metadata. Its final unpublished refresh also replaces the remaining visible `E&T` account labels and handles legacy abbreviations through the shared brand formatter. The backend package metadata is `code3-tcg-backend`; it is recorded for provenance and is not bundled into the native client. Base commit `986e831` plus reviewed local changes; version **1.0.0**, build **6**, app ID `app.code3tcg.mobile`, minimum API 24 and target API 36.

| Local package | Bytes | SHA-256 |
| --- | ---: | --- |
| `artifacts/native/Code3TCG-debug.apk` | 9,790,687 | `ed98843e60670a68e3d0c0f44f986402d283325e6f3fcb44049cc4734d8af304` |
| `artifacts/native/Code3TCG-beta.aab` | 7,203,191 | `b7dae1d89968ddc7ee009e7cef6f17b01f79b8e55e1632f746daafd4247f830f` |

The APK is debug-signed. The AAB reuses the existing upload key; no key was generated and neither package was uploaded or installed on a phone. Before replacement, all **19** build-5 package/evidence files were copied into `artifacts/native/build5-archive` and hash-verified. Builds 1–5 remain preserved separately. The preceding unpublished build-6 package/evidence files were also hash-verified and retained in `artifacts/native/build6-pre-abbreviation-archive` before the final label correction.

## Verified results

- The final configured native build includes the last package/lock name changes and all four frontend files containing the final abbreviation correction. Release completed **228** Gradle tasks and debug/unit completed **199** tasks. Both manifests report build **6** and display name Code 3 TCG. The generated unit example remains a compilation check, not a functional phone test.
- APK signature verification, AAB `jarsigner`, **624** signed payload entries against the existing upload certificate, and bundletool **1.18.3** validation passed. No duplicate or missing ZIP entries were found. Upload-certificate SHA-256 remains `79:A2:A7:43:31:4B:1A:A6:AF:05:AC:B0:13:5E:7C:01:F9:A7:FD:71:EC:7C:5B:9F:23:F7:04:BF:C6:01:C9:1A`.
- All **176** web assets in each package byte-match the final `dist-native`. Neither package retains the old `ember-tide-` asset filenames. All **13** renamed public artwork files are byte-identical to build 5, documented in `public-asset-renames-build6.json`.
- All **529** source/provenance inputs, including **42** public assets and both backend package metadata files, still matched their captured hashes after packaging. The generated `sealedProducts.json` hash is unchanged from build 5.
- Local phone preflight passed with **zero failures**. Hosted/manual/device rows remain unverified. Broad regression tests were not repeated for this package refresh; the previous native behavior results remain in the build-5 archive. The coordinator's web build passed at `artifacts/qa/branding-file-renames/web-build.log`.
- iOS assets synchronized; generated SPM/Gradle files retain relative paths without substantive source diffs. No build-6 iOS compilation, signing or physical-phone test was performed.
- After final verification, the repository's scoped Gradle command stopped **one daemon** successfully. No unrelated program was closed, and this refresh did not move the checkout directory.

## Provenance and evidence

| Input/evidence | SHA-256 |
| --- | --- |
| `src/App.jsx` at build time | `7901d935dc9d3be7f82eef6c330bc8336496d9399f06a86a46326b86184ef52c` |
| `artifacts/native/source-inputs-build6.json` | `64afadd45fbf4c625dd9c92ff3f78a151e87310621a1603565836120aa2fed02` |
| `artifacts/native/web-assets-manifest-build6.json` | `3aba160d1d91deafaab7377fb120f3dc8b247d08eebeb5ca789cef64572afb3b` |

Current results are recorded in `artifacts/native/release-verification.json`, `package-web-assets-build6.json`, `phone-preflight-build6.json`, `public-asset-renames-build6.json`, and the referenced `*-build6.log` files. Manifests use repository-relative paths so their evidence survives a later checkout-folder rename. Existing build-size/dynamic-import/Babel/Gradle warnings remain non-failing.

No account data, prices, production settings, commits, pushes or store uploads changed during this refresh. The source includes exact legacy image URL redirects for a later authorized web release; this native build did not deploy them. Production activation/HTTPS/native CORS, exact Auth callbacks, signed TestFlight delivery and physical-device data comparisons remain separate requirements. The [67-check hosted deletion acceptance](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md) used synthetic fixtures and does not replace those requirements. Preserve the existing PWA and transfer files during [phone testing](./PHONE_TEST_QUICKSTART.md); do not bypass an Android signing mismatch by clearing storage or uninstalling an app with unverified local records.
