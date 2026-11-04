# Open account campaign wording

The ordinary member path is: create a free account, confirm the email, and use
Code 3 TCG. Facebook and Discord are optional places to give feedback. Store
suggestions, shop participation and child-sensitive programs keep their existing
review requirements.

## Verified baseline

- Main: `b3e62aa061653d0a0916e85f4ca9f06018bb9d09`.
- Production: `dpl_9x598j598j29qM252MAhbwoPwQGX`, READY, `code3tcg.app`.
- The live Code 3 Supabase `code3_private.has_full_app_access()` already permits
  a valid current confirmed session with its own profile, without beta approval.
  Explicit account restrictions and staff checks remain in its function.
- `code3_open_member_registration` is recorded as applied on October 30.
- The generated directory includes VA 2,302, NC 2,580, MD 1,223 and DC 96 rows.
  These are directory records, not proof of current inventory or complete coverage.

## Change

Update stale visible onboarding/account wording to match open registration and
existing storage behavior. Preserve legacy internal keys and schema names. Add
both Facebook and Discord feedback links to the regional banner and clarify the
same optional feedback path on signup and the member home. Existing app actions,
confirmed sign-in, record ownership, workspace isolation, notification opt-ins,
staff permissions and program review are unchanged. No database or auth settings
are changed.

## Validation

- Six existing open-registration tests passed, including server denial, account
  switching, cross-account profiles and verified session identity.
- Eight existing member UI checks passed, including community link safety,
  separate notification opt-in and account-scoped introductions.
- Existing onboarding checks passed with the updated visible account label.
- Production Vite build passed; existing chunk-size and mixed Supabase import
  warnings remain.
- Targeted ESLint: no errors; existing `checkUser` effect dependency warning in
  `App.jsx` remains outside the changed lines.
- No new member account or private member records were created for verification.
- Browser automation was disabled in Work settings, so no visual browser check
  was attempted through another tool. Component render and deployed asset checks
  supplement the existing mobile layout and 44px action styles.

No paid ads, new API generation, schedules or messages are created by this change.
