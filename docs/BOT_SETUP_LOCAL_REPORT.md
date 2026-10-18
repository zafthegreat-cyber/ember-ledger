# Bot setup local completion report

Reviewed: 2026-10-17 (America/New_York)

Branch: `codex/all-bot-integration-setup`

Baseline: published main `eb560fc97d36939f19ae68aafbb1e1c7806e8632`, including the item-photo release from PR #12.

**Status: local setup and preservation fixes verified. Native bot connections are not implemented. No commit, push, merge or deployment was performed.**

## What works

The owner-only Bots page now provides one selector for Polar AIO, Sniped, Swooper AIO, Hayha, Stellar, Shikari, Valor and Refract. Polar, Sniped and Swooper appear first. The user confirmed Swooper AIO at `swooperhq.com`.

Each provider has its own reviewed guidance and official link. Owners can save and edit an installation name, optional device label and optional app version through the existing Bot Operations service. Saved records remain explicitly **Not connected**. Account Ops readiness derives from the same catalog, with native outbound schemas still unverified.

The screen uses existing theme tokens, accessible form labels, visible focus and 44-pixel controls. The mobile Task Groups navigation item is reachable again. Provider research details are disclosed on demand instead of displaying eight long cards.

## Data preservation

- Existing schema version 1, storage key and records are retained; new setup records use `MANUAL_RECORD` with disabled capabilities.
- Malformed, unsupported or unreadable stored data blocks loading/saving. The original bytes are kept, and a readable error replaces the form.
- Bot-specific Web Locks serialize browser mutations. Staged transactions commit once, detect intervening storage changes and reject stale edited versions. Browsers without Web Locks cannot silently fall back to unsafe saves.
- Queued writes cancel when the verified owner page lifetime ends. The page remounts using the verified identity key and avoids reloading records after unmount.
- Credential-like label content, including explicit license-key assignments, is rejected. Arbitrary unlabeled secrets cannot be reliably identified; the UI requests only names and version labels.
- Mixed-case `MOCK` no longer bypasses the service's test-only guard.

No private production records were queried or modified. No source catalog, price, backend, auth, cloud-sync, deployment or integration configuration was changed. Existing saved data and current source prices were not replaced. Tests use synthetic data in isolated browser contexts, leaving the signed-in app at ports 5239/5240 alone.

## Verification

| Check | Actual result |
| --- | --- |
| Frontend production build | Passed; existing large App chunk warning remains. |
| Full source ESLint | Passed; Babel printed its existing large-file formatting note. Final changed domain files also pass scoped lint. |
| Backend TypeScript build | Passed. No standalone frontend typecheck script exists. |
| Bot Operations and Stellar regression | 4,139 assertions passed, including 27 domain fixtures and 62 preview fixtures. |
| Account Ops foundation | 6,650 assertions passed across domain, security, 34 fixtures, zero-write and UI suites. |
| Backup and recovery | Backup: 22 sections/34 records; restore-preview passed; workspace recovery: 23 checks; session draft isolation: 21 checks. |
| Existing Bot browser regression | 39 captures, 998 assertions passed. |
| Setup responsive browser matrix | Six cases: 320, 390 and 1440 pixels, light/dark. All eight providers saved, edited and reloaded in each case. |
| Actual app route | 320-pixel light and 390-pixel dark save/edit/reload flows passed; all nine sections reachable; ordinary-user preview denied Bot access. |
| Storage failure browser tests | Invalid JSON, unsupported schema, unknown provider, read failure and corruption after load preserve original data; valid recovery works. |
| Final two-tab browser tests | Simultaneous creates and separate-record edits preserved both changes. Same-record edits yield one success and one conflict. Queued signout and identity-change saves write nothing. Explicit license text rejected. |
| Source whitespace | `git diff --check` passed. |

All browser cases reported no application errors, external provider requests or attempted network writes. Responsive cases reported no horizontal overflow. The full responsive and existing-browser matrices preceded the final transaction change; targeted storage/concurrency/session tests and the final domain suite, build and lint verified that change.

An earlier static Stellar test assumed a hard-coded two-provider registry; it was changed to assert disabled capabilities for all eight providers. Browser-test corrections retained meaningful checks for app-initialized workspace metadata and normal preview navigation. These were test expectation corrections, not claims of provider connectivity.

## Evidence

- [Responsive and actual-app results](../artifacts/qa/bot-provider-setup/results.json)
- [Final storage, concurrency and cancellation results](../artifacts/qa/bot-provider-setup/results-targeted.json)
- [39-screen regression manifest](../artifacts/qa/code3-phase2da-bot-operations/current/manifest.json)
- [Desktop dark screenshot](../artifacts/qa/bot-provider-setup/1440-dark-provider-setup.png)
- [Actual mobile app screenshot](../artifacts/qa/bot-provider-setup/390-dark-actual-app.png)
- [Build log](../artifacts/qa/bot-provider-setup/build.log)
- [Lint log](../artifacts/qa/bot-provider-setup/lint.log)

## What remains

**Saving an installation is not a native integration.** Live runtime/status sync, native order imports and task control remain unavailable for all real providers. No provider account, private guide, real export, bot executable or authentication secret was accessed. Physical-phone and screen-reader verification were not performed, and no publication or live-provider smoke test is claimed.

[Current provider research](./BOT_PROVIDER_CAPABILITY_REVIEW.md) records the official sources and the gaps. Polar AIO, Sniped and Swooper AIO still need supported interface documentation or a safe native export specification before a real connector can be implemented. Refract documents checkout-history CSV, but exact headers and date/currency formats still need verification. Stellar's existing JSON preview remains heuristic and memory-only; it is not task import or sync.

The next integration step is obtaining provider-approved read-only API/export contracts with representative sanitized samples and app versions. No hidden endpoints, invented formats, provider control, checkout automation or credential collection were added to substitute for those missing contracts.
