# Login refresh and publication status

2026-09-14

The user authorized publishing the local app update to code3tcg.app and supplied the old Code 3 TCG sign-in screenshot. Inspection also found an oversized logo in the local signed-out layout; prior viewport checks detected overflow but did not enforce useful logo/card dimensions.

Added a scoped signed-out layout with Code 3 branding, bounded logo, readable two-column desktop composition, form-first mobile layout, consistent fields, and accessible account actions. Auth handlers and provider configuration were not changed.

Verification passed:
- Production frontend build.
- Six login layout checks: 360, 875, and 1440 pixels in light and dark themes, including logo bounds, form placement, input size, no horizontal overflow, and no page errors.
- Password-reset and signup navigation at each size; no credential submission or email sending.
- Centralized branding and keyboard/reduced-motion checks.
- Git diff whitespace check.

Screenshots: artifacts/qa/login-refresh/. Test: scripts/test-login-presentation.cjs.

Publication completed after the user authenticated Vercel.

- Existing project: zafthegreat-cybers-projects/ember-tide-tcg.
- Production domain: https://code3tcg.app
- Deployment: dpl_49xffrPzHXSEvaq8JgUtLLYx7bG6 (READY).
- Immutable URL: https://ember-tide-ceafkj0xd-zafthegreat-cybers-projects.vercel.app
- Production build passed; existing bundle-size warning remains.
- All six login layout/reset/signup-navigation checks passed against the live domain. Log: artifacts/qa/production-login-verification.log.
- Added .vercelignore to exclude QA artifacts, local environment files, dependencies, and local build output.

Deployment used the existing production environment. No provider or environment settings were changed. Source remains locally uncommitted; publication was made directly from this checkout using the Vercel CLI.
