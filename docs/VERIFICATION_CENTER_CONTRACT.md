# Code 3 Verification Center Contract

Status: Phase 2A.6-A local-only, human-in-the-loop review foundation. No verification provider, mailbox, SMS service, CAPTCHA service, or retailer integration is connected.

## Purpose

The Verification Center combines bounded owner-action reminders for:

- CAPTCHA;
- MFA;
- email verification;
- SMS verification;
- retailer security prompts;
- terms requiring direct owner action; and
- password reset.

A `VerificationAction` is an ephemeral review projection. It contains safe references, workflow label, state, creation/expiry time, bounded instructions, and warnings. It contains no challenge response or authentication material.

## States

General action states are `ACTION_REQUIRED`, `WAITING`, `COMPLETED`, `FAILED`, `EXPIRED`, and `CANCELLED`.

CAPTCHA-specific display states are `CAPTCHA_REQUIRED`, `WAITING_FOR_USER`, `CHALLENGE_OPEN`, `SOLVED`, `FAILED`, `EXPIRED`, and `CANCELLED`. Non-CAPTCHA actions must use `NOT_APPLICABLE` for the challenge state. A displayed `SOLVED` state records only an owner-reported lifecycle fact; Code 3 does not capture, validate, store, or reuse a CAPTCHA token.

## Human boundary

Code 3 may detect or display that a human step is required, pause a proposed workflow, tell the owner to complete the step in the legitimate retailer/provider interface, and resume review after the owner reports completion.

Code 3 must not:

- solve a CAPTCHA or use a CAPTCHA-solving service or farm;
- harvest, retain, replay, transfer, or reuse a CAPTCHA response;
- intercept, read, generate, store, log, hash, back up, or autofill an OTP or MFA value;
- bypass email, SMS, password-reset, security-prompt, or terms workflows;
- automatically accept terms;
- scrape cookies, sessions, browser storage, or provider responses; or
- present local completion as provider verification.

MFA, OTP, and CAPTCHA values belong only in the provider's legitimate interface. Phase 2A.6-A uses fake placeholders in synthetic tests and does not include real phone numbers, email credentials, accounts, or sessions.

## Resume behavior

`Resume After Verification` is review/navigation language, not an automated continuation promise. `resumeAllowed` remains false unless a future provider-specific contract proves a safe, owner-controlled continuation boundary. No external request or retailer mutation occurs in this phase.

## Attention and notifications

Open verification items may feed the derived Attention Center with bounded category, priority, label, and navigation target. Notification preferences are non-persisted planning metadata in Phase 2A.6-A: no push, email, webhook, or SMS message is sent.

## Security and persistence

Strict allowlists and recursive Account Ops screening reject authority/session injection, secret-like fields and values, unsafe URLs, raw payloads, and prototype-pollution structures before normalization. UI errors remain bounded and never echo sensitive input.

Verification actions, challenge state, Attention items, and notification projections add no repository, localStorage/sessionStorage/IndexedDB entry, backup section, migration source, remote record, log sink, or telemetry payload. The existing verified OWNER gate remains mandatory before Account Ops data access.
