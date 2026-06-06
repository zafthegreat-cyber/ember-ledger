# Public Beta Feedback and Waitlist

## Scope

This pass adds a public beta feedback and waitlist intake surface for Ember & Tide without changing backend schema, auth, billing, database policies, RLS, payments, uploads, messaging, scraping, live AI, checkout, or live inventory behavior.

## Entry Points

- Public beta landing: `Join Beta / Request State` and `Send Beta Feedback`.
- Hearth: `Join beta / send feedback` quick action.
- More: `Join / Feedback` command menu item and `Join Beta / Request State` in Feedback / Help.
- Onboarding / waitlist: `Request your state` and `Join beta / request state`.
- The Spark: `Help The Spark` and sponsor support interest.
- Shop Portal: shop/sponsor partnership interest.
- Ember Assist: `Join beta / send feedback` quick action.

## Form Fields

- Name optional.
- Email for follow-up.
- Follow-up email opt-in.
- State required.
- City / region optional.
- Role required.
- Main reason required.
- App interest checkboxes.
- Message optional but encouraged.
- Safety consent acknowledgement.

## Role Options

- Parent / Family
- Collector
- Player
- Seller
- Shop
- Sponsor / Donor
- Other

## Interest Options

- Vault collection tracking
- Scout restock alerts
- Market fair value
- Forge trades/sales
- The Spark kids program
- Shop partnership
- Family safety tools
- Other

## Submission Behavior

The UI validates required fields, queues a local feedback record, and then attempts to insert into the existing `beta_feedback` table when the Supabase client is configured. If the backend path is unavailable or fails, the user sees an honest local-queue success state instead of a false saved-to-cloud promise.

No uploads, payments, messaging, checkout, live AI, retailer scraping, or inventory integrations are connected.

## Backend Status

No backend, auth, billing, database, or RLS changes were made in this pass. The app uses the existing beta feedback inbox path if available. If that path is unavailable, the response remains local on the device under the existing beta feedback storage key.

## Safety And Privacy

The form includes this safety copy:

> Please do not include private child information, payment details, passwords, or sensitive account details.

The form does not request private child details, passwords, payment information, file uploads, or proof images.

## Future Backend TODOs

- Add a dedicated public beta intake API only if the current beta feedback table is not the long-term home.
- Add server-side validation and rate limiting before broader public promotion.
- Add admin review grouping for state requests, shop interest, sponsor interest, and Spark supporter interest.
- Add privacy-aware export of public beta feedback for planning without exposing personal data.

## QA Results

Verified locally against the current local app at `http://127.0.0.1:5207` with backend feedback insert requests blocked to confirm the honest local fallback state without creating a real QA feedback row.

- 390x844: pass
- 430x932: pass
- 768x1024: pass
- 1440x900: pass

Screenshots and the JSON QA matrix were saved under:

`artifacts/qa/public-beta-feedback-waitlist/`

The matrix covered:

- public beta landing
- feedback form blank state
- validation error state
- local fallback success state
- onboarding waitlist
- The Spark
- Shop Portal

Result: 28 captures, 0 overflow/dock-overlap/console/max-update-depth failures.

## Mock / Local-Only Notes

The form always queues locally first. Cloud persistence is best-effort through the existing feedback table and the UI clearly states when the response is only local.
