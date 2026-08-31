# Code 3 Bot Provider Capability Review

Status: Phase 2D-B1 discovery and pilot design only. Research was performed on 2026-08-31 against publicly accessible first-party Hayha and StellarAIO sources. No provider login, private Discord content, license credential, application traffic, undocumented endpoint, bot process, provider network API, real export, or live installation was accessed.

Published baseline: `cdde7df506c94bc55b2ec7995596843ae1c2261a`.

## Decision

`NO LIVE BOT PILOT YET`.

Neither provider currently exposes a publicly documented, read-only Bot-to-Code-3 interface that can prove runtime health, task status, history, and checkout evidence without additional provider confirmation or handling sensitive data. Phase 2D-B1 therefore enables no provider, no network adapter, no control capability, and no verified retailer coverage.

The safest next candidate is an offline, owner-selected preview of a Stellar task-group export. Stellar's current public Tasks overview documents task import/export controls, but it does not establish the export's exact serialized format or version-compatibility rules. Before that candidate can become a Phase 2D-B2 parser, Code 3 still needs a synthetic or fully redacted current schema/version sample and provider confirmation that owner use of the export for local, read-only organization is permitted. The preview must fail closed on profile, account, payment, proxy, cookie, token, session, license, or other secret-bearing fields.

Hayha has no comparable publicly documented safe task export or read/status interface in the reviewed sources. Its documented Amazon session export copies a login token and is explicitly unsuitable for Code 3.

## Evidence vocabulary

The review uses these states:

- `VERIFIED_SUPPORTED`: a current public first-party source explicitly documents the mechanism. It does not mean Code 3 enabled it.
- `DOCUMENTED_BUT_LIMITED`: a first-party source documents a narrower or sensitive mechanism that does not satisfy the proposed read-only pilot as-is.
- `UNKNOWN`: the reviewed public first-party sources do not establish support or non-support. Absence of documentation is not treated as proof that a capability is unsupported.
- `UNSUPPORTED`: a first-party source explicitly states that the capability is unavailable. No reviewed capability was placed in this state without such a statement.
- `DO_NOT_USE`: the mechanism conflicts with provider terms, Code 3 security boundaries, or this phase's prohibition on private interfaces, credential handling, reverse engineering, or control.

Evidence state and runtime capability are separate. Every Hayha and Stellar runtime capability remains `false`, even where a related provider feature is documented.

## Source freshness and limitations

Research date: 2026-08-31.

Hayha's public product page appears current but provides product-level marketing rather than an integration specification. Its public guide carries a 2021 copyright and tells users to rely on support Discord/development announcements for newer information. Restricted Discord material was not accessed. Hayha's public terms state an effective date of 2019-08-05. Because the public guide is old and no public changelog or integration specification was found, all unverified integration capabilities remain `UNKNOWN` and require current written provider confirmation.

Stellar's public guide is actively updated, but page freshness varies. The getting-started guide reported an update one month before review; the documented WebSocket integration reported 16 days; Discord notification guidance reported one year; profile export guidance ranged from five to eleven months; and session mass-import guidance reported two years. The current Tasks overview confirms import/export controls but not the exact serialized format or version rules. Provider version and export schema therefore must be confirmed at pilot time.

No public current Stellar policy specifically authorizing a third-party read/status companion was located. The documented WebSocket compatibility page authorizes the narrow monitor-input pattern it describes; it is not evidence of a general API or permission to inspect the application. A provider login or acceptance of new terms was not attempted.

## First-party sources reviewed

### Hayha

- [Hayha product page](https://www.hayhabots.com/) — public product capabilities, platforms, and GUI/CLI description; no public integration API claim.
- [Hayha public guide](https://docs.hayhabots.com/) — guide entry point; public content carries a 2021 copyright and points users to support channels for newer information.
- [Hayha Terms of Use](https://www.hayhabots.com/tos.html) — effective 2019-08-05; prohibits automated access, data extraction, decompilation, reverse engineering, and code manipulation without explicit authorization.
- [Hayha Footsites guide](https://docs.hayhabots.com/site-guides/footsites/) — documents interactive GUI/CLI task operation, not an external integration interface.
- [Hayha Amazon guide](https://docs.hayhabots.com/site-guides/amazon/) — documents account/session handling and an import/export flow that copies a login token; that export is secret-bearing and prohibited for Code 3.
- [HayhaAIO UI guide](https://hayha-bots.gitbook.io/hayhaaio/ui) and [Snipes USA Guide V2](https://hayha-bots.gitbook.io/guide-v2/sites/snipes-usa) — Hayha-branded public guides document configured webhook fields and a Discord queue-pass/checkout-link notification, but publish no general event schema, signing, retry, or task-status contract.

### StellarAIO

- [StellarAIO getting-started guide](https://guides.stellaraio.com/stellar) — current product orientation, local client setup, Discord notifications, tasks, sessions, profiles, and proxies.
- [Stellar Tasks overview](https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-tasks-tab) — documents task-group Import and Export controls; the exact serialized format and version-compatibility rules require current confirmation.
- [Stellar Tasks tab](https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-tasks-tab) — documents in-client task groups and owner controls; it does not document an external read API.
- [Stellar WebSocket integration](https://guides.stellaraio.com/stellar/developing-software-compatible-with-stellar/websocket-integration) — documents external monitor servers pushing product data into Stellar. The direction is into the bot, not Bot status/history out to Code 3.
- [Stellar Discord notification setup](https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-settings-tab/how-to-set-up-discord-notifications) and [Settings tab](https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-settings-tab) — document an owner-supplied Discord incoming-webhook URL and notification choices.
- [Stellar Profiles tab](https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-profiles-tab) and [profile import/export](https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-profiles-tab/how-do-i-mass-import-and-export-profiles) — document profile export while also showing that profiles contain shipping, billing, and payment information.
- [Stellar session/account import](https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-identities-tab/how-do-i-add-a-session-or-mass-import-sessions) — documents secret-bearing account/session inputs, including passwords, proxies, and two-factor material.
- [Stellar move-to-new-PC guide](https://guides.stellaraio.com/stellar/installation-uninstallation/how-do-i-move-stellaraio-to-a-new-pc-server) — documents a broad configuration export containing saved information; it is not a safe Bot Operations import source.

## Hayha integration-mode matrix

Every recommendation below leaves runtime capabilities false.

| Mode | Availability and source | Authentication, data, and secrets | Read/status/control/evidence | Policy, risk, complexity, and recommendation |
| --- | --- | --- | --- | --- |
| `OFFICIAL_API` | `UNKNOWN`. No public API or API reference was found on the product site or public guide. | Authentication and available data are unknown; no credential is authorized. | Read, status, history, control, and checkout evidence are unverified. | Policy confidence low; risk high; complexity unknown. `NOT_READY` pending current written provider confirmation and public documentation. |
| `DOCUMENTED_WEBHOOK` | `DOCUMENTED_BUT_LIMITED`. Hayha-branded public guides show configured webhooks and a Snipes Discord queue-pass/checkout-link notification. | A Discord webhook URL is a posting credential, and a queue-pass/checkout link may be transferable. No general schema, signing, retry, ordering, version, or privacy contract is published. | A narrow notification exists, but no complete read/status/history stream or safe Code 3 receiver is established. | Policy confidence medium for the narrow user workflow; security risk high. `NOT_READY` pending current provider confirmation. |
| `DOCUMENTED_EXPORT` | `DOCUMENTED_BUT_LIMITED`. The Amazon guide documents exporting a login token. | The exported value is an authentication secret. | It is not safe task/status/history data and cannot support read-only observation. | Policy confidence high for the narrow in-client feature, but security risk critical. `DO_NOT_USE` for Code 3. |
| `DOCUMENTED_LOCAL_INTERFACE` | `DOCUMENTED_BUT_LIMITED`. The public guide documents interactive GUI/CLI task operation. | It uses an owner-operated licensed client; no external auth/interface contract is documented. | The CLI controls task start/stop; it does not document a read-only machine interface. | Terms prohibit automated access/reverse engineering. Risk critical; complexity high. `DO_NOT_USE` for automation or integration. |
| `SUPPORTED_PLUGIN` | `UNKNOWN`. No public plugin/extension contract was found. | Unknown. | No capability established. | Policy confidence low; risk high; complexity unknown. `NOT_READY`. |
| `OWNER_FILE_IMPORT` | `UNKNOWN` for safe Bot data. The only reviewed export is a session token. | A known export is secret-bearing; no safe task file schema is documented. | No safe read/status/history path. | Risk critical for the documented token export. `NOT_READY`; do not request a real file. |
| `LOCAL_READ_ONLY_COMPANION` | `UNKNOWN`. No supported output or read-only interface was found. | Any license/process/app access would require explicit provider authorization. | No read-only capabilities established. | Terms make scraping, process inspection, private API use, and automated access `DO_NOT_USE`. No bridge should be built yet. |
| `MANUAL_IMPORT` | `UNKNOWN` as a provider export. Owner-authored Code 3 metadata remains possible but would not be a Hayha integration. | No provider credential is permitted; only independently authored nonsecret metadata could be considered. | No provider status/history/evidence. | Low implementation complexity but no provider evidence. `NOT_READY` as a pilot. |
| `UNSUPPORTED_PRIVATE_API` | `DO_NOT_USE`. An internal HTTP interface, if one exists, is not a supported API. | Would likely require private credentials or session material. | Any apparent capability is unverified. | Terms and Code 3 policy prohibit discovery or use. Risk critical. |
| `REVERSE_ENGINEERED_INTERFACE` | `DO_NOT_USE`. | Would require prohibited binary/process/traffic inspection or authentication reuse. | No capability may be derived this way. | Expressly outside provider terms and project scope; risk critical. |

## Stellar integration-mode matrix

Every recommendation below leaves runtime capabilities false.

| Mode | Availability and source | Authentication, data, and secrets | Read/status/control/evidence | Policy, risk, complexity, and recommendation |
| --- | --- | --- | --- | --- |
| `OFFICIAL_API` | `UNKNOWN`. No public general-purpose Stellar Bot API or SDK reference was found. | Authentication and data are unknown; no credential is authorized. | Read/status/history/control/evidence are not established through an API. | Policy confidence low; risk high; complexity unknown. `NOT_READY` pending provider confirmation. |
| `DOCUMENTED_WEBHOOK` | `DOCUMENTED_BUT_LIMITED`. Official settings guides document Discord incoming-webhook notifications, including checkout/failure options. | Stellar consumes an owner-provided Discord webhook URL. The URL is a credential and is not authorized for Code 3. | Notifications may carry bounded success/failure evidence, but the documented path targets Discord and does not expose a Bot status API or task control. | Policy confidence medium for Discord delivery; security risk high for credential handling; complexity medium. `NOT_READY` until Stellar confirms a generic or authenticated owner-controlled receiver. |
| `DOCUMENTED_EXPORT` | `DOCUMENTED_BUT_LIMITED`. The current Tasks overview documents task-group export/import controls but does not establish the exact file format or version rules. Profiles and broad configuration also export but contain or may contain sensitive data. | A task export may carry profile/proxy/account references; profile/config/session exports can contain PII, payment, credential, or session material. | A sanitized task export could expose static task-group/task configuration, not verified runtime status/history. | Policy confidence medium for owner export; risk medium-to-critical by file type; complexity medium. Only a currently confirmed task-export format is a conditional offline candidate. Profile/config/session exports are `DO_NOT_USE`. |
| `DOCUMENTED_LOCAL_INTERFACE` | `VERIFIED_SUPPORTED` for the narrow WebSocket monitor-input protocol. | Stellar connects to an owner-specified `ws`/`wss` server; the guide describes an API key in the query string. | Direction is external product pings into Stellar. It does not read runtime/task/history out and could influence active tasks. | Policy confidence high for that documented input pattern; control/checkout risk high; complexity medium. `DO_NOT_USE` for the read/status pilot. |
| `SUPPORTED_PLUGIN` | `UNKNOWN`. No general plugin contract was found. | Unknown. | No capability established. | Policy confidence low; risk high; complexity unknown. `NOT_READY`. |
| `OWNER_FILE_IMPORT` | `DOCUMENTED_BUT_LIMITED` for an owner-selected task export after current format/version confirmation. | No provider token should be needed, but the file must be treated as untrusted and rejected if it carries account/profile/proxy/payment/session secrets. | Can support an offline static preview of task groups/tasks only. It does not prove runtime, status, history, or checkout. | Policy confidence medium; risk medium with strict sanitization; complexity low-to-medium. `PREFERRED_OFFLINE_CANDIDATE`, pending schema and provider confirmation. |
| `LOCAL_READ_ONLY_COMPANION` | `UNKNOWN`. No documented Stellar-to-companion output/status interface was found. | Any future pairing or webhook secret must be server-side and separately approved. | No read/status/history path established. | Policy confidence low; risk high; complexity medium-to-high. `NOT_READY`. |
| `MANUAL_IMPORT` | `DOCUMENTED_BUT_LIMITED` when limited to an owner-selected, sanitized task-export preview after current format/version confirmation. | Same restrictions as `OWNER_FILE_IMPORT`; raw files are not persisted or backed up. | Static configuration only; no live status/history/evidence. | Policy confidence medium; risk medium; complexity low-to-medium. Candidate for Phase 2D-B2 dry-run design, not a live provider pilot. |
| `UNSUPPORTED_PRIVATE_API` | `DO_NOT_USE`. Internal client communications are not evidence of a supported API. | Would likely expose license, session, retailer, or payment context. | Any apparent capability is unverified. | No discovery or use; risk critical. |
| `REVERSE_ENGINEERED_INTERFACE` | `DO_NOT_USE`. | Would require prohibited binary/process/traffic inspection or authentication reuse. | No capability may be derived this way. | Outside project scope and without verified provider authorization; risk critical. |

## Capability evidence and activation

All `enabled` values remain `false`. A documented in-client feature is not an external adapter capability.

| Capability | Hayha evidence state | Stellar evidence state | Runtime activation |
| --- | --- | --- | --- |
| `OBSERVE_RUNTIME` | `UNKNOWN`; no public read/status interface found. | `UNKNOWN`; no public Bot-to-client health interface found. | Hayha `false`; Stellar `false`. |
| `READ_TASK_GROUPS` | `UNKNOWN`; no safe task export found. | `DOCUMENTED_BUT_LIMITED`; owner-exported task-group data is static and its exact format/version rules are unverified. | Both `false`. |
| `READ_TASKS` | `UNKNOWN`. | `DOCUMENTED_BUT_LIMITED`; static task-export data only, schema not yet reviewed. | Both `false`. |
| `READ_STATUS` | `UNKNOWN`. | `UNKNOWN`; task export does not prove live status and Discord notifications are not a status stream. | Both `false`. |
| `READ_HISTORY` | `UNKNOWN`. | `UNKNOWN`; no public history export/API found. | Both `false`. |
| `READ_CHECKOUT_EVIDENCE` | `UNKNOWN`. | `DOCUMENTED_BUT_LIMITED`; Discord notifications may contain event evidence, but no safe Code 3 receiver is documented. | Both `false`. |
| `CREATE_TASK` | In-client task creation exists, but no supported external interface; integration state `DO_NOT_USE`. | In-client creation exists, but no supported external API; WebSocket product pings are not task creation authority for Code 3. | Both `false`. |
| `EDIT_TASK` | In-client behavior only; no external contract. | In-client behavior only; no external contract. | Both `false`. |
| `START_TASK` | Interactive CLI/UI behavior is documented; automation is `DO_NOT_USE`. | In-client behavior only; no external contract. | Both `false`. |
| `STOP_TASK` | Interactive CLI/UI behavior is documented; automation is `DO_NOT_USE`. | In-client behavior only; no external contract. | Both `false`. |
| `RESTART_TASK` | `UNKNOWN` as an external capability. | `UNKNOWN` as an external capability. | Both `false`. |
| `READ_ACCOUNT_METADATA` | Session/token material is documented and secret-bearing; `DO_NOT_USE`. | Session/account imports are credential-bearing; `DO_NOT_USE` for this pilot. | Both `false`. |
| `READ_PROXY_METADATA` | No safe export/interface found; `UNKNOWN`. | No safe standalone export/interface confirmed; broad config and task references require rejection/sanitization. | Both `false`. |
| `READ_PROFILE_METADATA` | No safe export/interface found; `UNKNOWN`. | Profile export is documented but contains shipping, billing, and payment data; `DO_NOT_USE` for this pilot. | Both `false`. |

No capability evidence in this review verifies Target, Walmart, Best Buy, or any other retailer as a live Code 3 provider capability. Retailer marketing or in-client guides do not activate Code 3 retailer coverage.

## Policy and terms findings

Hayha's public terms expressly prohibit automated means of accessing the service, data extraction, decompilation, reverse engineering, and software/content manipulation without explicit authorization. Code 3 therefore treats private API discovery, process attachment, traffic inspection, GUI/CLI automation, file scraping, and authentication reuse as `DO_NOT_USE`. Its personal/household and non-transferability language also means a companion or shared-access model requires provider confirmation rather than inference.

Stellar publicly documents task/profile/config exports, Discord notifications, and its external monitor WebSocket protocol. Those pages authorize only their described owner workflows. They do not establish a general third-party read API, task-control API, or permission to inspect internal traffic. No current public third-party-integration terms were located in the reviewed official public sources. Provider confirmation is required before a live companion, webhook receiver, or recurring import.

No new terms were accepted and no gated dashboard, support Discord, or private documentation was opened.

## Read versus control boundary

The first approved adapter, if one becomes supportable, must be observation-only:

```text
OBSERVE_RUNTIME
READ_TASK_GROUPS
READ_TASKS
READ_STATUS
READ_HISTORY
READ_CHECKOUT_EVIDENCE
```

The following capabilities remain independently false and unavailable:

```text
CREATE_TASK
EDIT_TASK
START_TASK
STOP_TASK
RESTART_TASK
```

Sensitive metadata capabilities also remain independently false:

```text
READ_ACCOUNT_METADATA
READ_PROXY_METADATA
READ_PROFILE_METADATA
```

An adapter must not derive control authority from a read path, reuse a license/session token, or infer a capability from the Bot's internal behavior. A file preview cannot control a Bot. A Discord notification cannot control a Bot. Stellar's documented monitor WebSocket is an input/control-adjacent path and is excluded from the first pilot.

## Discord webhook limitation

The reviewed Stellar flow asks the owner to paste a Discord incoming-webhook URL into Stellar. That URL authorizes posting into one Discord channel; it is not a readable event feed and does not let Code 3 poll prior messages. Code 3 must not obtain a Discord user token, scrape a private channel, proxy an existing secret, or redirect a live webhook during discovery.

A future direct receiver is viable only if Stellar confirms that a generic HTTPS or Discord-compatible owner endpoint is supported and Code 3 can authenticate each event. The design would require a dedicated server endpoint, a separate revocable verification secret, replay/idempotency controls, bounded schemas, raw-body minimization, redacted logs, and explicit owner configuration. Until provider confirmation exists, `DOCUMENTED_WEBHOOK` remains limited and disabled.

Hayha-branded public guides document limited Discord output, but not a stable general webhook-output contract. The same receiver, credential, signing, redaction, and provider-confirmation requirements apply.

## Export sanitization boundary

The only proposed offline candidate is a Stellar task-group export explicitly selected by the owner after its current format and version rules are confirmed. No real export was accessed in Phase 2D-B1.

A future dry-run parser must:

1. Require an owner-selected local file and never watch provider directories automatically.
2. Treat the file as untrusted and perform a zero-write preview before any normalized metadata can be saved.
3. Require an exact, reviewed schema/version and reject unknown or mixed-version structures by default.
4. Recursively reject passwords, license keys, API/bearer tokens, cookies, sessions, OTP/2FA values, security codes, payment/PAN/CVV data, retailer credentials, proxy hosts/endpoints/usernames/passwords, credential-bearing URLs, raw headers, and raw provider payloads.
5. Reject or reduce profile, account, session, and proxy objects to separately approved opaque local references; never persist their source values.
6. Allow only bounded task configuration such as provider version, task-group label, retailer/site label, nonsecret product identifier, mode label, quantity/max-price proposal, and inactive local assignment references after review.
7. Make no claim that imported configuration is live, running, healthy, successful, or historically observed.
8. Compute an idempotent local source hash without storing the raw file and preserve correction/provenance history.
9. Exclude the raw export from Backup Format v1, logs, analytics, browser persistence, and normal UI state.
10. Never write back to Stellar, create/start/edit a task, create Checkout Evidence, or create a Purchase.

Profile CSV, broad `config.json`, account/session exports, and Hayha session-token exports are excluded. Their documented data surface is too sensitive for the proposed task-metadata preview.

## Optional Local Bot Bridge constraints

A Code 3 Local Bot Bridge remains a design option, not an implementation. It may be considered only after the provider documents or explicitly authorizes an output interface.

The bridge would be owner-installed, opt-in, revocable, version-pinned, and observation-only. It could receive a documented signed webhook or parse an explicitly owner-selected safe export. It must not inject into a process, inspect memory, intercept TLS, discover private endpoints, scrape windows or files, automate GUI/CLI input, reuse a license/session, capture retailer/payment/proxy credentials, or modify Bot configuration.

File access must use explicit owner selection rather than background discovery. Network events must be authenticated where the provider supports it, normalized immediately, rate-bounded, idempotent, and stripped of raw provider bodies. A future bridge-pairing token or webhook verification secret requires a separate Bot-specific server-side secret review and must not reuse the paused mailbox/provider-security Upstash resource without explicit authorization.

## Pilot selection criteria and result

The discovery evaluated official support, read-only direction, secret exposure, owner control, revocability, auditability, stability, data minimization, checkout/payment risk, and implementation complexity.

- Hayha: no safe public read/status API, webhook, or task export was established. Public terms materially constrain automated access and reverse engineering. Result: `NOT_READY`.
- Stellar: task export/import controls are documented and owner-initiated; the unverified current format/version rules and unknown schema prevent immediate ingestion. Discord notifications and the WebSocket protocol do not provide a safe read/status adapter. Result: `OFFLINE_REVIEW_CANDIDATE`, not a live pilot.

Recommendation: no live provider pilot. The first bounded candidate for Phase 2D-B2 is a local, zero-write, synthetic/redacted Stellar task-export preview, contingent on current format/version confirmation, provider confirmation, and an approved safe schema. If those prerequisites cannot be obtained, retain manual Code 3 metadata entry and do not connect either Bot.

## Proposed Phase 2D-B2 scope

Phase 2D-B2 is not authorized by this review. If separately approved, its maximum initial scope should be:

1. Obtain current written Stellar confirmation that an owner may use a task-group export in a local read-only companion.
2. Obtain a synthetic or fully redacted current task-export sample with confirmed format/version rules and no payment, retailer credential, account, profile, proxy, cookie, token, session, license, or personal data.
3. Freeze and test an allowlisted schema/version for a local owner-selected file.
4. Implement a dry-run-only sanitizer and mapping preview into inactive Code 3 Task Group, Task, and Product Target proposals.
5. Add recursive secret rejection, size/depth limits, source hashing, idempotency, conflict reporting, and raw-file non-retention.
6. Keep all provider/runtime/control/checkout capabilities false; make no network call and write nothing to Stellar.
7. Require explicit OWNER review before any safe local metadata save; do not create Attempt, Checkout Evidence, Order Candidate, Purchase, Receiving, or Inventory records.
8. Validate mobile/desktop review UI, Backup exclusion, Restore Preview, credential scans, and full regression with synthetic fixtures only.

This is an offline/manual import preview, not a live Bot integration.

## Credential boundary

Phase 2D-B1 creates no credential store. Any future Bot API token, webhook verification secret, or Local Bridge pairing token needs a Bot-specific server-side design, environment isolation, revocation, audit, and separate authorization. It must remain distinct from retailer passwords, payment data, cookies, proxy credentials, Bot license keys, and the paused Gmail/Outlook provider-security infrastructure.

## Preserved phase boundaries

- Hayha and Stellar remain `NOT_CONFIGURED`; all live capabilities and provider network access remain false.
- `Bot Success != Purchase`, `Bot Checkout Evidence != Purchase`, and `Order Candidate != Purchase` remain enforced.
- No task was created, read from a live Bot, edited, started, stopped, or restarted.
- No cart, checkout, order, Purchase, Receiving, Inventory, quantity, or cost-basis mutation occurred.
- Phase 2B2-B.1 remains paused; its Upstash/Supabase/Vercel state was not inspected or changed and `hostedRuntimeVerified=false`.
- `LOCAL_ONLY` remains authoritative, `REMOTE_ACTIVE` remains disabled, and the canonical schema remains unapplied.
- Gmail, Outlook, billing, and Production remain untouched.
