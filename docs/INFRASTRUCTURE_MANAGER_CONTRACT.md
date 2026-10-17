# Code 3 Infrastructure Manager Contract

Status: Phase 2A.6-A local-only metadata and product/UX foundation. No cloud, server, remote-desktop, browser-session, monitoring, or billing provider is connected.

## Purpose

The Infrastructure area provides one coherent owner view of synthetic metadata for future machines and workspaces. It does not manage infrastructure.

Supported projections include:

- server records: friendly name, provider/cloud label, region, operating-system label, purpose, state, last-seen display time, bounded CPU/memory placeholders, estimated-cost metadata, assigned Bot references, remote-access method, and warnings;
- cloud templates: provider/region, size/class, estimated exact minor-unit cost, disk, purpose, and recommended capacity;
- remote-access records: server reference, protocol/method label, owner label, state, last-connected time, and warnings; and
- browser workspaces: profile and retailer/account references, open/closed display state, bounded tab count, extension labels, safe autofill-profile reference, last-active time, and warnings.

Server display states are `OFFLINE`, `ONLINE`, `DEGRADED`, `STARTING`, `STOPPING`, and `UNKNOWN`. These are fixture/owner metadata in Phase 2A.6-A; no live health check or telemetry has occurred.

## No-action boundary

Code 3 does not:

- provision, resize, start, stop, restart, terminate, or bill a machine;
- call a cloud API, monitoring endpoint, agent, or private server interface;
- establish RDP, browser-remote, SSH, or another remote session;
- implement a remote-desktop protocol;
- launch or control a Bot;
- persist live proxy endpoints or credentials;
- harvest browser cookies, tokens, local/session storage, history, or fingerprints; or
- spoof or randomize fingerprints to evade retailer controls.

Cloud cost is an estimate label only. A template is not a provision request or billable resource. `ONLINE` is not proof of reachability.

## Browser and autofill boundary

Browser workspace metadata may organize an existing owner-approved profile/account relationship. It may show extension labels and a safe autofill-profile reference, but does not inspect extension data or establish a session. Safe autofill is limited to ordinary owner-approved name, shipping address, email, and phone references. Authentication, payment, verification, cookie, session, proxy, and anti-detection data are prohibited.

## Security, persistence, and future work

All records use strict bounded allowlists and recursive security screening. Infrastructure projections and templates are deeply frozen, non-authoritative, and non-persisted. They add no local storage key, repository, backup source, migration path, remote configuration, environment variable, provider credential, or network client.

A future active manager requires a separately approved provider contract, least-privilege server-side credentials, OWNER authorization, accurate health semantics, explicit mutation confirmation, idempotency, audit history, cost/billing controls, revocation, and safe remote-session handoff. Phase 2A.6-A grants none of those capabilities.
