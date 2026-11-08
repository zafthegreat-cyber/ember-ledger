# Hosted deletion and attachment acceptance — October 24, 2026

**Result: 117 real HTTPS/browser checks passed.** This closes the isolated deployed-API and browser-integration gates. Production deletion is still disabled; an existing production receipt's UI opening and physical-phone acceptance are not certified by this result.

## Targets and isolation

- Data-less Supabase branch: `code3-privacy-final-20261024`, project `gvudurifesjatwforpnx`, branch UUID `76ea2145-7151-44db-8756-4e7c04d97374`. Removed after testing; branch-list readback confirms absence.
- Immutable Vercel Preview: `dpl_Fgo2L7Mm48MJnrQPKTKo7Hb3jomE`, source `9fc272306330b2edd90097205889e9a8be57a4b1`, branch `codex/privacy-https-acceptance-20261024`. Its app/backend privacy implementation matches the relevant production implementation; subsequent harness-only corrections are recorded in this review branch.
- All acceptance writes targeted newly generated, server-stamped synthetic accounts. The harness rejects the production Supabase ref, known production hosts/deployment IDs, aliases, redirects, supplied existing accounts and unreviewed file manifests. Default/config modes make zero network requests.
- A separately approved test key was held in a restricted, ignored local file and as a branch-specific Preview Secret. Production credentials were not exported, reused or copied into Preview. Short-lived Vercel access stayed in memory and was forwarded only to the exact reviewed Preview origin; Chromium did not inherit server credentials.

Historical migration replay stopped at the existing missing-foundation gap. A reviewed transaction reconstructed empty tables and installed only actually deployed historical privacy dependencies. A second guarded supplement mirrored existing cloud-source sanitization triggers from current catalog definitions, without copying provider notices/tombstones or activating eBay. Neither operation changed production or fabricated historical migration rows.

Independent relevant parity passed: 96 tables, 1,493 named column definitions, 393 constraints, 292 indexes, 453 policies, 87 triggers, 288 effective table/role grant entries, 12 schema-use entries, six buckets and all 97 shared function definitions/attributes/ACLs. Eleven separate Discord-only RPCs were explicitly excluded. Thirty-eight physical column ordinals differed, with named definitions identical. Existing production security warnings remain documented; this is not a blanket security certification.

## Results

| Run | Result and scope |
| --- | --- |
| `190b9dfb-7096-420d-a965-e1d0b9de419e` | 67 hosted Auth/Storage checks passed through the loopback router, including injected Storage/Auth/lost-response failures and verified retries. All four synthetic accounts removed through normal deletion. |
| `01376080-1e79-4e48-ac49-954b96fe5555` | 117 deployed HTTPS/browser checks passed. All three synthetic accounts removed through normal password-confirmed deletion. No production or shared-price writes. |

The final HTTPS run verified:

- Exact deployment identity, allowed CORS, rejected foreign origins, unauthenticated denial and noncacheable account responses.
- Rejection of caller-selected account IDs and incorrect passwords, with no deletion started after failed confirmation.
- Owner-only downloads and signing in all four private buckets; anonymous/public and cross-account access denied; signed URLs preserve original references and return the original synthetic bytes.
- Real component mounting, authenticated signing, image loading, renewal before expiry, explicit provider rejection of the same previously working URL after expiry, local session revocation across all four buckets, sign-out and account-switch isolation.
- The actual deployed `/delete-account` page: sign-in, review, cancellation, empty/typed confirmation, wrong-password feedback, one confirmed deletion and account-specific completion across tabs.
- Deleted Auth users, profiles, preferences, file manifests, access sessions and refresh tokens; unchanged sentinel profile, cloud snapshot/revision, original references, personal price fields and file bytes before normal sentinel cleanup.

Both browser contexts recorded **zero page errors and zero blocked requests**. Component integration made 102 real provider requests; the deployed UI made three Auth requests and the expected two deletion POSTs (wrong password, then confirmed deletion).

Private-image integration uses the actual source components and Supabase client bundled into one synthetic HTML document. Its Auth/RPC/Storage/image calls are real. Protected Preview responses are forwarded from the actual HTTPS service with redirects refused. There are no fake API/image replies or substituted app modules. This component result is distinct from a stored production receipt workflow and native-device acceptance.

## Earlier failures and corrections

Failed reports remain preserved rather than being relabeled as successful:

- `0e8b1542-70f6-49d8-873e-5a573304362b`: the temporary component bundle used classic JSX, producing a missing React binding. The fixture now matches Vite's automatic JSX transform. An offline runtime regression mounts the actual components, rather than only checking compilation.
- `613a93d3-9d4c-4f9e-85b3-4d9287394f5d` and `936db350-2158-4cfa-b04d-45cd456ddcdb`: functional browser checks completed, but the test's storage initializer ran on a second tab's opaque `about:blank` and raised a SecurityError. It now checks the exact approved origin before any storage access; genuine storage failures still fail the test.

Strict zero-error assertions stayed enabled. Numeric diagnostics admit only fixed contexts/keys and bounded integer counts; raw errors, routes, headers, tokens, passwords and file contents are excluded. Offline counterexamples cover expiry false positives, late renewal, wrong file identity, incomplete revocation, redirect leakage and diagnostic injection.

## Preservation and remaining production gates

Production stayed separate at `gxsfququorfczvhrkudl`. Record/revision/report/object fingerprints matched the preservation baseline: two cloud workspaces, 79 revisions, zero reports and one Storage object. All 4,729 published catalog records/prices retained semantic SHA-256 `b2dc6bdc5ab6684be212e6fb06f7db5b480bfde1aca709d557f5da5893fb70f0`.

The owner signed in normally on the computer. Read-only navigation confirmed the app is available, with its existing cloud-saving review notice. Neither version was selected, overwritten or merged. The single existing receipt object is retained and private. Aggregate reference checks found no link to it in either current cloud workspace or any of the 79 revisions, consistent with the earlier zero-reference table audit. Its normal in-app opening/signing path therefore remains **unverified**; no reference or record was invented to manufacture that proof.

The concurrent Discord release changed production to `29a946136acc9d16aa5386d1987af9a086b24451` / `dpl_6oSr2qaSTVPZ1Yazo3kikQVCV9sD`. Its catalog/prices and privacy routes pass, but its older base dropped the approved Google verification file and search metadata. This separate review branch integrates that published Discord source while retaining the Google/search fixes and applied migration filenames. It has not been promoted to production. Do not redeploy an older source snapshot over either set of changes.

Production's administrative Secret remains stored only in Vercel Production. `CODE3_ACCOUNT_DELETION_ENABLED` remains absent. A disabled status response cannot validate that key because readiness is checked before Auth/RPC. Production enablement/operational verification remains a release step; do not test by deleting a real account or bypassing owner/shared-catalog blockers.

Physical Android/iPhone testing remains paused at the owner's request. Store enrollment, signing, configured packages and physical save/sync/attachment acceptance retain their separate gates in [beta readiness](BETA_PACKAGE_READINESS_2026-10-24.md).

## Cleanup and evidence

Seven branch-only Preview variables, including its Secret, were removed and absence checked. Both temporary Preview deployments were removed. The Production Secret remained present and Sensitive; the Production deletion flag stayed absent. The restricted local credential file was removed. No key, token or private file content is committed.

The successful run left no account/file fixtures of its own. Before removal of the entire disposable branch, four accounts and 16 objects retained from the three failed runs were independently matched to their exact known run stamps/manifests; zero pending deletion jobs or catalog rows existed. They were removed by deleting the approved disposable branch, rather than forcing privileged account cleanup past a failed assertion.

Ignored sanitized evidence resides under:

- `artifacts/qa/hosted-account-deletion/<run-id>.json`
- `artifacts/qa/hosted-account-deletion-https/<run-id>.json`
- `artifacts/qa/privacy-final-acceptance-20261024/`, including guarded schema manifests, parity/postflight metadata, preservation checks and Preview cleanup metadata.

Use the [guarded HTTPS runbook](HOSTED_DELETION_HTTPS_ACCEPTANCE.md) for a future run. A new isolated branch requires new reviewed pins and credentials; the removed test environment cannot be reused.
