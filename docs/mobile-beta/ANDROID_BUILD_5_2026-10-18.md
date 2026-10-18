# Android build 5 — Code 3 TCG branding

Build 5 refreshes the native packages with the reviewed Code 3 TCG visible copy, helpers, export filenames and artwork. Base commit `986e831` plus the reviewed local changes; version **1.0.0**, build **5**, app ID `app.code3tcg.mobile`, minimum API 24 and target API 36. Existing storage identifiers and compatibility paths remain intact.

| Local package | Bytes | SHA-256 |
| --- | ---: | --- |
| `artifacts/native/Code3TCG-debug.apk` | 9,171,965 | `5e8773355e660fcc14ada250caebd172ef11e091607934c818c1313bcdec820d` |
| `artifacts/native/Code3TCG-beta.aab` | 7,203,264 | `1a646591fda9b21e1bdbf1f10a46106add009996ad3d501f026692599c23f70a` |

The APK is debug-signed for device testing; the AAB uses the same existing upload key. No key was generated and nothing was uploaded. Before replacement, all 19 build-4 package/evidence files were copied to `artifacts/native/build4-archive` and their hashes verified. Builds 1–4 remain preserved separately.

## Verification

- Configured native web build and Android release completed: **228** release Gradle tasks and **199** debug/unit tasks. Both package manifests report build **5** and display name Code 3 TCG. The generated unit example is not a functional phone test.
- APK signature verification passed. AAB `jarsigner`, all **624** signed payload entries against the unchanged upload certificate, and bundletool **1.18.3** validation passed. No duplicate or missing ZIP entries were found. Upload-certificate SHA-256: `79:A2:A7:43:31:4B:1A:A6:AF:05:AC:B0:13:5E:7C:01:F9:A7:FD:71:EC:7C:5B:9F:23:F7:04:BF:C6:01:C9:1A`.
- All **176** web assets inside each package byte-match `dist-native`. The build input manifest records **527** inputs, including all **42** public assets; every input hash was rechecked after packaging and remained unchanged.
- Native **19** behavior scenarios, the App export regression and **8** synthetic phone-preflight scenarios passed. Current local phone preflight reports **zero failures**; manual/hosted/device rows remain unverified.
- The coordinator verified the final web build, full `src` lint and **11** focused branding/legacy-compatibility scripts. Web-build evidence: `artifacts/qa/brand-rename/web-build.log`; lint command session `77783` exited 0. The existing deferred-browser suite has a pre-existing eager-import assertion failure confirmed against HEAD; this report does not claim that suite passed.
- iOS assets synchronized; generated SPM/Gradle files retain relative paths with no substantive Git diff. No build-5 iOS compile, distribution signing or physical-phone test was performed. The earlier account-free iOS simulator pass remains separate evidence.

## Source and artifact evidence

| Input/evidence | SHA-256 |
| --- | --- |
| `src/App.jsx` at build time | `6f32a0df092e2d58ab9136dcc9e6c1c5417e3ab5b259fb15aad2b00a9242b281` |
| `artifacts/native/source-inputs-build5.json` | `76107c738e7701941fee0917aea2d12f0e81ace681a8cdcf5bed4145a00a0c7d` |
| `artifacts/native/web-assets-manifest-build5.json` | `cb5932292d5b931bc6d2a9127358e3ce40cec9cfe23088885b247aa2e2c34cf5` |

The input manifest records each source/public asset path, byte count and hash; the asset manifest records each built web asset. Current results are in `artifacts/native/release-verification.json`, `package-web-assets-build5.json`, `phone-preflight-build5.json` and the referenced `*-build5.log` files. Existing bundle-size/dynamic-import/Babel/Gradle warnings remain non-failing.

No account data, generated prices, production settings, commits, pushes or store uploads changed during this package refresh. The separate [67-check hosted deletion acceptance](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md) used synthetic fixtures and was cleaned up; it does not establish production HTTPS/native CORS, deployed UI or physical-device behavior. Production activation, exact Auth callbacks, signed TestFlight delivery and real-device data comparisons remain required. Follow the [phone quickstart](./PHONE_TEST_QUICKSTART.md), preserving the PWA and verified transfer files. An Android signature mismatch must not be bypassed by clearing storage or uninstalling an app with unverified local data.
