# Hosted readiness audit — 2026-09-15

This is a read-only inspection during the current implementation request. No hosted schema, settings, account, data or deployment was changed.

## Database state

The connected Supabase project **Code 3 TCG** reports `ACTIVE_HEALTHY`. Its existing legacy inventory, sales, expense, workspace and catalog tables contain data. The current migration list ends at `20260523204500`; the newer canonical `20260820120000` migration and `code3_*` tables are absent. Every public table returned by the metadata inventory reports RLS enabled. This does not establish policy correctness, complete coverage or recovery readiness.

The new canonical datastore must be tested independently before any approved cutover. An empty canonical schema must never be mistaken for an empty production database.

## Hosting access

The repository is linked to the `ember-tide-tcg` Vercel project. The connected Vercel tool returned `403 Forbidden` for that project and no accessible teams. Hosted environment/deployment inspection and the legitimate-owner success case remain unverified. A request to reconnect the owning Vercel account is pending. No deployment was attempted.

## Security advisor findings

The hosted advisor reported the following review items:

- Three functions have a mutable search path: `beta_invite_status`, `normalized_app_role`, and `set_updated_at`. [Supabase search-path guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- Six security-definer functions are executable by the anonymous role; seventeen are executable by authenticated users. These include workspace permission helpers and intended administrative RPCs. Each requires a privilege/body review; being callable is not by itself proof of an authorization bypass. A focused metadata check confirmed that the workspace helpers reference `auth.uid()`, and the inspected public functions did not reference user-editable `user_metadata`. This was not an exhaustive policy audit. [Anonymous execution guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated execution guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Leaked-password protection is disabled. Configuration and plan eligibility must be reviewed before activation. [Password-protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- `beta_invites` has RLS enabled without a direct table policy. The existing RPC-only design may intentionally deny table access; do not add a permissive policy to silence the informational notice. [RLS policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

No advisory was automatically silenced and no remote grants were broadened.

## Current local work

The current candidate adds an owner boundary to private legacy API reads and legacy mutations, preserves public catalog and `/api/stores` directory reads, and keeps modern API families behind their existing boundaries. An independent synthetic review also confirmed private-marked report disclosure through both report APIs and internal schedules/notes through legacy `/stores` and `/predictions/week`; those paths now require owner access and matching client headers. Report routes remain private until a separately reviewed public projection exists. It also removes unauthenticated monitor execution when a server credential is missing. The expanded local security suite passes 60 cases. These changes require release review and deployment before they affect hosted behavior. See [release acceptance](./RELEASE_ACCEPTANCE.md) for the remaining gates.
