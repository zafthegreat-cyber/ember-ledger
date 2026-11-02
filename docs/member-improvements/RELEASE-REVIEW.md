# First 20 prioritized member improvements

The 250 suggestions came from a fictional feedback simulation. This ranking is a product plan based on the current app audit, not measured member sentiment. Original IMP identifiers and wording are preserved in `priority-plan.json` and `prioritized-250.txt`. A feature that already exists is retained as a baseline safeguard rather than counted again.

This batch improves joining, recovering access, completing a first collecting task, and getting help. It uses existing account and collection boundaries. Best Buy stays locked paused; this release does not run retailer checks or activate alerts.

## Scope and acceptance

| Rank | Original ID | Delivered behavior |
| --- | --- | --- |
| 1 | IMP015 | Recovery status is the same for account-existence errors and never displays raw provider diagnostics. |
| 2 | IMP011 | Email confirmation help uses the existing real signup resend API and platform callback, with validation, a duplicate guard, timeout recovery and a one-minute cooldown. |
| 3 | IMP013 | Expired confirmation and recovery links explain how to request the correct fresh link. OAuth retains its separate callback verification gate. |
| 4 | IMP007 | All three signup renderers explain which name is public and how account fields are used. |
| 5 | IMP222 | Feedback describes administrator/moderator review, local fallback and community-post visibility before submission. |
| 6 | IMP224 | Feedback has a stable UUID reference, matching the cloud insert, plus explicit save/restore/remove controls for account-scoped tab drafts. A missing cloud receipt remains an unknown outcome. |
| 7 | IMP231 | Public support offers separate feature, account, bug, safety and shop topics with editable email drafts. Nothing sends automatically. |
| 8 | IMP166 | Scout and public support show source coverage with an always-readable Best Buy paused label. |
| 9 | IMP168 | Coverage explains that paused Best Buy performs no inventory checks or automatic retailer alert sends. The actual backend pause must be checked separately before release. |
| 10 | IMP167 | Coverage distinguishes member observations, reviewed reports and automatic retailer sources. |
| 11 | IMP001 | The visitor introduction leads with saving an owned item and seeing it in a collection. |
| 12 | IMP004 | Members choose distinct collector, seller or shop introductions with appropriate next actions. Choices grant no authority. |
| 13 | IMP005 | The default introduction opens the existing Vault collection add flow and explains the saved result. |
| 14 | IMP027 | The first suggested task is one item, with photos, prices and extra detail left optional. |
| 15 | IMP028 | Skip and reopen work on Home and Account without resetting existing records or onboarding. |
| 16 | IMP030 | Introduction preferences contain only an enum path and dismissal, under a validated account UUID. Account switching remounts the guide. Blocked storage remains usable. |
| 17 | IMP029 | Area preferences, Online interests and device location are explained as optional personalization. |
| 18 | IMP031 | Six themed destinations are paired with their plain functions; next actions name their destinations. |
| 19 | IMP216 | Discord and Facebook links describe their distinct uses and remain optional. |
| 20 | IMP219 | Guidance separates group membership, Discord sign-in, role opt-ins, app alerts and device notifications. |

## Data and operational boundaries

No database migration, policy change, role grant, hosted function replacement, new provider credentials, or retailer scheduler change is included. Existing verified-session, same-account linking and private-workspace protections stay in place. Unverified social provider buttons remain hidden.

Introduction preferences are local and account-scoped, not cloud-synced. Feedback drafts are saved only on an explicit click, scoped to one account in session storage, omit auto-filled name/email and metadata, and are removed on account change. A draft is not a submission. A cloud submission uses its reference as the existing table's UUID primary key; it grants no read access. Existing feedback authorization remains unchanged. Real support messages and emails require the member's own action.

## Validation

The new behavior and component checks cover account-neutral recovery, SDK arguments, duplicate clicks, cooldowns, uncertain timeouts, expired-link classification, account preference isolation, blocked storage, bounded draft fields, draft removal, distinct support drafts, guide actions, skip/reopen and community consent guidance. Existing social sign-in, open-registration, account-session, cloud-workspace, privacy-support and native bridge checks are also run.

Browser checks use a disposable context, a synthetic account, a nonexistent test project and intercepted requests. They exercise the actual app/SDK UI without sending real emails, publishing community reports, pinging roles, or contacting retailers. Native bridge regression checks are mocked; this batch does not claim a newly signed store binary or device OAuth acceptance.

The release receipt records exact passing counts, browser evidence, commit and production deployment. Known baseline warnings are the App checkUser hook dependency and existing bundle-size/dynamic-import build warnings.

Local results: 21 new behavior/component tests, 35 existing social/open-registration tests, 34 privacy-support checks, 38 account-session checks, 20 cloud-workspace checks, 25 mocked native scenarios plus native export checks, Quick Add routing and Vault workflow checks passed. Eleven browser flows passed, including a temporary feedback delivery failure and draft recovery. Signup was inspected at 375, 768 and 1280 pixels. The root package has no generic `test`, `lint` or `typecheck` command; the available targeted checks, `lint:src` equivalent and web build are used.

Best Buy read-only receipt at 2026-10-31 01:15:13 UTC: paused true, locked_paused true, inventory schedule inactive, checked 0, sent 0, last attempt null. Existing cache maintenance stays separate from inventory monitoring.

## Rollback

Revert the release commit or restore the prior production deployment. There is no database migration to reverse. Existing account and collection records are unchanged; the small introduction preference keys and explicitly saved tab drafts can be ignored by the prior code. Best Buy remains paused during rollback.

SDK reference: [Supabase signup resend](https://supabase.com/docs/reference/javascript/auth-resend), [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
