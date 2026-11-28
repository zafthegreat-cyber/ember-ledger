# Stock alert preferences — release gate

This feature is part of the draft Code 3 TCG inventory intelligence PR and is **not yet active in production**.

A member can explicitly save retailer, alert-type, watched-product and quiet-hours choices in a dedicated private table. No default opt-in exists: enabled defaults to FALSE. RLS requires the user's own authenticated, valid account session for every read/write/delete. The table stores no email, phone, Discord token or device identifier.

The matching logic is a pure, fail-closed function with tests. It requires an unexpired signal, selected retailer/type, product match when requested, and observes quiet hours in the user's selected time zone. Official signals also require a recently validated official source. Reported inventory cannot pass as confirmed purchase availability.

The UI clearly says **preferences only—delivery inactive**. Neither database preferences nor an in-app toggle creates a push/Discord subscription by itself.

Do not activate dispatch until (1) approved retailer feeds and source-health checks exist, (2) isolated staging migration/owner RLS tests succeed, (3) an authenticated service-only fanout uses deduped outbox and delivery receipts, (4) opt-out and quiet hours are enforced server-side, and (5) staff approves the recipient and retention security controls. Never send to children or non-consenting members.

Migration: supabase/migrations/20261124221500_stock_alert_preferences.sql. Do not apply directly to production or replay older stock migrations out of order.